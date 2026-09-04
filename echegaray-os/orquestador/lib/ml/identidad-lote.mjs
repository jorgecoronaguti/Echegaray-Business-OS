// RESOLVER UN LOTE DE NOMBRES A IDENTIDADES CANÓNICAS. ES LA PUERTA QUE USAN COMPRAS Y CHEQUES.
//
// ═══ POR QUÉ EXISTE ESTE ARCHIVO Y NO SE LLAMA `resolver()` EN UN FOR ═══
//
// El cruce de cheques resuelve 114 cheques contra 190 filas de Compras. Llamar a `resolver()` una
// vez por fila haría 304 lecturas del padrón, 304 lecturas de aliases y 304 INSERT en
// `ml_resolucion` — para 60 nombres distintos. La unidad de trabajo real no es la fila: es el
// TEXTO. El mismo criterio que `imputacion-pendiente.mjs` aplica a las obras.
//
// ═══ LA REGLA QUE HACE CUMPLIR: NO SE GASTA ML SI YA ESTÁ RESUELTO ═══
//
// La escalera de `entity-resolution.mjs` corta sola en CUIT, exacto y alias — nunca llega a los
// embeddings si una señal determinística ya decidió. Este módulo agrega el corte de más arriba:
// un texto que ya se resolvió en este lote no se vuelve a resolver, y un texto cuya resolución ya
// está escrita en `ml_resolucion` con esta misma versión del resolver y de los umbrales tampoco.
// Eso es lo que hace que el backfill sea idempotente y barato al repetirlo.
//
// ═══ LO QUE ESTE MÓDULO NO HACE ═══
//
// No toca importes, ni cheques, ni pagos, ni el CUIT de origen. Devuelve identidad. La conciliación
// del dinero la siguen decidiendo las reglas que ya existen, con los mismos números de siempre.

import { randomUUID } from 'node:crypto'
import { query } from '../db.mjs'
import { padronDe, aliasesDe } from './identidad.mjs'
import { resolverIdentidad, ESTADO, VERSION, cuitCanonico } from './entity-resolution.mjs'
import { umbralesDe, configUmbrales } from './umbrales.mjs'
import { normalizar } from './embeddings.mjs'
import { registrarTraza, drenarTrazas } from './traza.mjs'

/**
 * La clave de un pedido de identidad: EL TEXTO TAL COMO ESTÁ ESCRITO, más el CUIT.
 *
 * El CUIT entra porque el mismo texto con dos CUIT distintos son dos preguntas distintas — y la
 * respuesta correcta a la segunda es «entidades distintas».
 *
 * ═══ POR QUÉ NO SE NORMALIZA LA CLAVE ═══
 *
 * Porque la pantalla busca por el texto que tiene a la vista. Si la clave fuera la forma
 * normalizada, «Robles Pinturerías S.R.L.» y «ROBLES PINTURERIAS» compartirían fila y la pantalla
 * que muestra el primero no encontraría nada — o peor, la web tendría que reimplementar
 * `normalizar()` en TypeScript y las dos definiciones empezarían a divergir el día uno. La
 * normalización vive donde tiene que vivir: ADENTRO del resolver.
 *
 * El costo de resolver dos veces lo mismo no se paga igual: `resolverLote` memoiza por forma
 * normalizada, así que dos escrituras del mismo nombre son dos filas y UN solo cálculo.
 */
export function claveConsulta({ nombre, cuit } = {}) {
  return `${String(nombre ?? '').trim().toUpperCase()}|${cuitCanonico(cuit) ?? ''}`
}

/** La clave de CÁLCULO: dos textos que normalizan igual tienen la misma respuesta, y se calcula una
 *  sola vez. No se persiste: es un detalle de eficiencia, no un dato. */
function claveCalculo({ nombre, cuit } = {}) {
  return `${normalizar(nombre)}|${cuitCanonico(cuit) ?? ''}`
}

/** Sólo los estados que autorizan a VINCULAR. Sugerido y ambiguo no vinculan: esperan a una persona. */
export function vincula(estado) {
  return estado === ESTADO.AUTO_RESUELTO || estado === ESTADO.VERIFICADO_HUMANO
}

/**
 * Resuelve muchos (nombre, cuit) de una vez.
 *
 * @param {Array<{nombre:string, cuit?:*}>} consultas
 * @param {object} opts
 *   entidad     — 'proveedor' por ahora; el resolver no tiene nada específico de proveedores
 *   fuente      — qué módulo lo pidió; va en `ml_resolucion` y sirve para medir por planilla
 *   persistir   — false para el DRY RUN del backfill: medir no puede escribir
 *   reusar      — true (default): si ya hay una decisión escrita con esta misma versión, se reusa
 *   usarEmbeddings — false degrada a determinístico + fuzzy sin cargar el modelo
 *   ejecutar    — con qué se habla con Postgres. Por defecto el pool. Existe para que un test pueda
 *                 pasar el cliente de SU transacción: la base productiva rechaza toda escritura
 *                 commiteada desde un test, y con razón — un test que deja filas en producción no
 *                 es un test, es una corrida.
 * @returns {{porClave:Map<string,object>, metricas:object, traceId:string}}
 */
export async function resolverLote(consultas = [], {
  entidad = 'proveedor', fuente = null, persistir = true, reusar = true,
  usarEmbeddings = true, padron = null, aliases = null, traceId = null, ejecutar = query,
} = {}) {
  const tid = traceId ?? randomUUID()
  const u = umbralesDe(entidad)
  const p = padron ?? await padronDe(entidad)
  const a = aliases ?? await aliasesDe(entidad)

  // Un pedido por TEXTO distinto, no por fila.
  const unicas = new Map()
  for (const c of consultas) {
    const k = claveConsulta(c)
    if (k === '|') continue // ni nombre ni CUIT: no hay pregunta que hacer
    if (!unicas.has(k)) unicas.set(k, { nombre: c?.nombre ?? '', cuit: c?.cuit ?? null, veces: 0 })
    unicas.get(k).veces += 1
  }

  const yaEscritas = reusar && persistir ? await decisionesVigentes(entidad, [...unicas.values()], ejecutar) : new Map()

  const porClave = new Map()
  const memo = new Map()
  const m = {
    consultas: consultas.length, unicas: unicas.size, reusadas: 0, calculadas: 0, memoizadas: 0,
    porMetodo: { strong_id: 0, exacto: 0, alias: 0, fuzzy: 0, embedding: 0, ninguno: 0 },
    porEstado: { auto_resuelto: 0, sugerido: 0, ambiguo: 0, sin_match: 0, verificado_humano: 0 },
    conML: 0, sinML: 0, msTotal: 0, msMax: 0,
  }

  for (const [k, c] of unicas) {
    const vigente = yaEscritas.get(k)
    if (vigente) {
      m.reusadas += 1
      const r = { estado: vigente.estado, match: vigente.entidad_id ? { id: vigente.entidad_id, nombre: vigente.nombre_canonico } : null,
        confianza: vigente.confianza == null ? null : Number(vigente.confianza), metodo: vigente.metodo,
        porQue: vigente.por_que, resolucionId: Number(vigente.id), veces: c.veces, reusada: true }
      porClave.set(k, r)
      m.porEstado[r.estado] = (m.porEstado[r.estado] ?? 0) + 1
      m.porMetodo[r.metodo] = (m.porMetodo[r.metodo] ?? 0) + 1
      m.sinML += 1
      continue
    }

    // MEMO POR FORMA NORMALIZADA. «Robles Pinturerías S.R.L.» y «ROBLES PINTURERIAS» son dos filas
    // distintas en `ml_resolucion` —cada texto original conserva la suya— pero una sola pasada por
    // la escalera: el modelo no se carga dos veces para contestar lo mismo.
    const kc = claveCalculo(c)
    let r = memo.get(kc)
    let ms = 0
    if (r === undefined) {
      const t0 = Date.now()
      r = await resolverIdentidad({ nombre: c.nombre, cuit: c.cuit }, p, { umbrales: u, aliases: a, entidad, usarEmbeddings })
      ms = Date.now() - t0
      memo.set(kc, r)
      m.calculadas += 1
      m.msTotal += ms
      m.msMax = Math.max(m.msMax, ms)
    } else {
      m.memoizadas += 1
    }

    const metodo = metodoDeSenales(r.señales)
    m.porMetodo[metodo] = (m.porMetodo[metodo] ?? 0) + 1
    m.porEstado[r.estado] = (m.porEstado[r.estado] ?? 0) + 1
    // «Necesitó ML» = la escalera llegó a fuzzy o a embeddings. CUIT, exacto y alias no son ML.
    if (metodo === 'fuzzy' || metodo === 'embedding') m.conML += 1; else m.sinML += 1

    let resolucionId = null
    if (persistir) resolucionId = await escribirResolucion({ r, entidad, c, fuente, traceId: tid, metodo, ejecutar })

    registrarTraza({
      traceId: randomUUID(), capacidad: 'entidad.resolver',
      metodo: metodo === 'embedding' ? 'ml-local' : metodo === 'fuzzy' ? 'estadistica' : 'regla',
      modelo: metodo === 'embedding' ? 'Xenova/multilingual-e5-small' : null,
      proveedor: metodo === 'embedding' ? 'local' : null,
      ms, confianza: r.confianza ?? null,
      accion: vincula(r.estado) ? 'aplicar' : r.estado === ESTADO.SUGERIDO ? 'sugerir' : 'descartar',
      sensibilidad: 'interno',
    }, { modulo: fuente ?? 'identidad-lote', ejecutar })

    porClave.set(k, { ...r, metodo, resolucionId, veces: c.veces, reusada: false })
  }

  m.msPromedio = m.calculadas ? Math.round(m.msTotal / m.calculadas) : 0
  return { porClave, metricas: m, traceId: tid }
}

/** Las decisiones ya escritas para estos textos, si se tomaron con ESTA versión del resolver y de
 *  los umbrales. Con otra versión no valen: la lógica que las produjo ya no es la que corre. */
async function decisionesVigentes(entidad, consultas, ejecutar = query) {
  if (!consultas.length) return new Map()
  const nombres = consultas.map((c) => String(c.nombre ?? ''))
  const q = await ejecutar(
    `select distinct on (r.valor_original, coalesce(r.cuit_original,''))
            r.id, r.valor_original, r.cuit_original, r.estado, r.entidad_id, r.metodo, r.confianza,
            r.por_que, p.nombre as nombre_canonico
       from public.ml_resolucion r
       left join public.proveedores p on p.id::text = r.entidad_id
      where r.entidad = $1 and r.valor_original = any($2::text[])
        and r.resolver_version = $3 and r.umbrales_version = $4
      order by r.valor_original, coalesce(r.cuit_original,''), r.ts desc`,
    [entidad, nombres, VERSION, configUmbrales().version])
  const m = new Map()
  for (const f of q.rows) m.set(claveConsulta({ nombre: f.valor_original, cuit: f.cuit_original }), f)
  return m
}

async function escribirResolucion({ r, entidad, c, fuente, traceId, metodo, ejecutar = query }) {
  try {
    const q = await ejecutar(
      `insert into public.ml_resolucion (trace_id, entidad, valor_original, cuit_original, fuente,
                                         entidad_id, estado, metodo, confianza, señales, por_que,
                                         resolver_version, umbrales_version)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
      [traceId, entidad, String(c.nombre ?? ''), cuitCanonico(c.cuit), fuente,
       r.match?.id ?? null, r.estado, metodo, r.confianza ?? null,
       JSON.stringify(r.señales ?? {}), r.porQue, VERSION, configUmbrales().version])
    return Number(q.rows[0].id)
  } catch (e) {
    console.warn(`  ⚠ no se pudo persistir la resolución de «${c.nombre}» (se sigue): ${e.message.slice(0, 80)}`)
    return null
  }
}

/** Qué señal ganó. Duplica a propósito la de `identidad.mjs` sólo mientras las dos existan; la
 *  fuente es `señales`, que es lo que queda escrito. */
export function metodoDeSenales(s = {}) {
  if (s.strong_id_score === 1) return 'strong_id'
  if (s.exact_score === 1) return 'exacto'
  if (s.alias_score === 1) return 'alias'
  if (s.embedding_score != null && s.embedding_score >= (s.fuzzy_score ?? 0)) return 'embedding'
  if (s.fuzzy_score != null) return 'fuzzy'
  return 'ninguno'
}

/**
 * PONE LA IDENTIDAD AL LADO DEL DATO, SIN TOCAR EL DATO.
 *
 * Devuelve las mismas filas con `idEntidad` agregado. El nombre y el CUIT originales quedan
 * exactamente como estaban: la identidad canónica es una columna MÁS, nunca un reemplazo. Ésa es la
 * diferencia entre enriquecer y destruir evidencia — y la razón por la que una fusión equivocada se
 * puede deshacer.
 */
export function anotarIdentidad(filas, porClave, { nombre = (f) => f.proveedor, cuit = (f) => f.cuit } = {}) {
  return filas.map((f) => {
    const r = porClave.get(claveConsulta({ nombre: nombre(f), cuit: cuit(f) }))
    if (!r || !vincula(r.estado) || !r.match) return { ...f, idEntidad: null, identidad: r ?? null }
    return { ...f, idEntidad: String(r.match.id), identidad: r }
  })
}

export { drenarTrazas, ESTADO }
