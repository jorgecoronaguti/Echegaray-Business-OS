// EL BORDE DE LA RESOLUCIÓN DE PRECIOS — lo único de este frente que toca la base.
//
// Mismo contrato que `pg.mjs`: acá no se calcula, no se decide y no se corrige nada. Se traduce
// entre las filas de Postgres y la forma que `precio-resolucion.mjs` consume, y se devuelve el
// crudo para que «¿lo trajo así la base o lo transformó el adaptador?» se pueda contestar sin volver
// a consultar.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ ESTE MÓDULO **NO ES PARA LA WEB**. LA RLS NO APLICA ACÁ.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Recibe un `query` que en la práctica es el pool del servidor, con un rol que NO pasa por
// row-level security. Uso legítimo: scripts, informes, tests, el worker. Uso prohibido: cualquier
// cosa que atienda a un usuario — ahí la escritura la hace el caller con SU credencial y la base
// vuelve a preguntar quién es.
//
// ═══ POR QUÉ `compra_sheet` Y NO `compras` ═══
//
// `public.compras` existe, tiene 20 columnas y está VACÍA: 0 filas al 30/08/2026. El nombre obvio
// no es la fuente. Las compras reales de ECSAS son las 913 filas de `public.compra_sheet`, el
// espejo de la pestaña Compras del Sheet. Buscar por el nombre y encontrar la tabla vacía es la
// forma más rápida de concluir «no hay historial de compras» teniéndolo.

import { candidatoDePrecio, ORIGEN, resolverPrecio } from './precio-resolucion.mjs'
import { comprasDeRecurso } from './compras-precio.mjs'

const iso = (v) => {
  if (!v) return null
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  return String(v).slice(0, 10)
}

/**
 * LOS RECURSOS Y TODA SU SERIE DE PRECIOS. UNA consulta, sin N+1.
 *
 * `codigos` vacío trae el catálogo entero. Se devuelve la SERIE COMPLETA por recurso —no sólo el
 * `vigente`— porque la vigencia derivada necesita medir la volatilidad en la propia serie, y esa
 * medición es imposible si el adaptador se queda con una sola fila. Hoy, medido, todas las series
 * tienen largo 1: el mecanismo existe igual, y el informe dice que no pudo medir.
 */
export async function leerRecursosConSerie({ query }, { codigos = null, soloActivos = true } = {}) {
  const { rows } = await query(
    `select r.id, r.codigo, r.nombre, r.unidad, r.tipo, r.familia, r.desperdicio, r.activo,
            rp.costo, rp.moneda, rp.fuente, rp.proveedor, rp.fecha_precio, rp.vigente
       from public.recurso r
       left join public.recurso_precio rp on rp.recurso_id = r.id
      where ($1::text[] is null or r.codigo = any($1::text[]))
        and ($2::boolean is false or r.activo is not false)
      order by r.codigo, rp.fecha_precio desc nulls last`,
    [codigos, soloActivos])

  const porCodigo = new Map()
  for (const f of rows) {
    const ya = porCodigo.get(f.codigo) ?? {
      id: f.id, codigo: f.codigo, nombre: f.nombre, unidad: f.unidad,
      tipo: f.tipo, familia: f.familia, activo: f.activo, serie: [],
    }
    // Una fila sin costo o sin fecha NO entra a la serie: no se puede vencer ni medir. Se pierde a
    // propósito y el conteo de abajo lo declara, en vez de convertirla en un cero.
    if (f.costo !== null && f.fecha_precio !== null) {
      ya.serie.push({
        precio: Number(f.costo), moneda: f.moneda ?? 'ARS',
        fuente: f.fuente ?? f.proveedor ?? 'recurso_precio sin fuente declarada',
        observadoEn: iso(f.fecha_precio), vigente: f.vigente === true,
      })
    }
    porCodigo.set(f.codigo, ya)
  }
  return { recursos: [...porCodigo.values()], crudo: rows }
}

/**
 * LAS COMPRAS REALES DE ECSAS. UNA consulta.
 *
 * No se filtra por familia ni por proveedor: el cruce concepto ↔ recurso lo hace `compras-precio.mjs`
 * con una regla explícita y testeada, y filtrar acá por una heurística de SQL escondería el criterio
 * en un `where` que nadie lee.
 */
export async function leerComprasReales({ query }, { desde = null, limite = 5000 } = {}) {
  const { rows } = await query(
    `select fila, fecha, proveedor, concepto, importe, comprobante, familia_material, anulada
       from public.compra_sheet
      where concepto is not null
        and ($1::date is null or fecha >= $1::date)
      order by fecha desc nulls last
      limit $2`, [desde, limite])
  return rows.map((r) => ({
    fila: r.fila, fecha: iso(r.fecha), proveedor: r.proveedor, concepto: r.concepto,
    importe: r.importe === null ? null : Number(r.importe),
    comprobante: r.comprobante, familia: r.familia_material, anulada: r.anulada === true,
  }))
}

/**
 * LOS CANDIDATOS A PRECIO DE UN RECURSO, de todas las fuentes de la base. PURA salvo por lo que
 * recibe.
 *
 * `candidatoDePrecio` tira cuando el dato es indefendible (precio 0, sin fecha, sin fuente). Acá eso
 * NO se deja explotar la corrida entera: se atrapa y el motivo se devuelve en `rechazados`. Un
 * catálogo con una fila rota no puede impedir que se resuelvan las otras 388, pero tampoco puede
 * desaparecer sin dejar rastro.
 */
export function candidatosDeRecurso({ recurso, compras = [] } = {}) {
  const candidatos = []
  const rechazados = []
  const meter = (fabricar) => {
    try { candidatos.push(fabricar()) } catch (e) { rechazados.push(String(e?.message ?? e)) }
  }

  for (const o of recurso.serie ?? []) {
    meter(() => candidatoDePrecio({
      recursoCodigo: recurso.codigo, valor: o.precio, moneda: o.moneda,
      origen: ORIGEN.INTERNO, observadoEn: o.observadoEn, detalleFuente: o.fuente,
      evidencia: { tabla: 'public.recurso_precio', recursoId: recurso.id, fuente: o.fuente },
    }))
  }

  const { observaciones, descartes } = comprasDeRecurso({ recurso, filas: compras })
  for (const o of observaciones) {
    meter(() => candidatoDePrecio({
      recursoCodigo: recurso.codigo, valor: o.precio, moneda: 'ARS',
      origen: ORIGEN.COMPRA_ECSAS, observadoEn: o.observadoEn,
      detalleFuente: `${o.evidencia.tabla} fila ${o.evidencia.fila} · ${o.proveedor ?? 'sin proveedor'} · ${o.porQue}`,
      proveedor: o.proveedor, confianza: o.confianza, evidencia: o.evidencia,
    }))
  }
  return { candidatos, rechazados, descartesDeCompra: descartes }
}

/**
 * RESOLVER EL PRECIO DE UN CATÁLOGO ENTERO. DOS consultas, no 2×N.
 *
 * `pesos` es `{codigo: fracción del costo}` cuando quien llama sabe cuánto pesa cada recurso en un
 * presupuesto concreto. Sin él, la materialidad va `null` y la resolución lo declara: no se supone
 * que un recurso no importa por no haberlo medido.
 */
export async function resolverCatalogo({ query }, { codigos = null, pesos = {}, desdeCompras = null, hoy = new Date() } = {}) {
  const { recursos } = await leerRecursosConSerie({ query }, { codigos })
  const compras = await leerComprasReales({ query }, { desde: desdeCompras })
  const resoluciones = recursos.map((recurso) => {
    const { candidatos, rechazados, descartesDeCompra } = candidatosDeRecurso({ recurso, compras })
    const f = pesos[recurso.codigo] ?? null
    const p = resolverPrecio({
      recurso, candidatos, serie: recurso.serie, hoy,
      // `impacto` y `costoConocido` se pasan como la fracción sobre 1: `materialidadDe` sólo usa su
      // cociente, y así quien llama puede pasar el peso relativo sin conocer el costo total.
      impacto: f === null ? null : f, costoConocido: f === null ? null : 1,
    })
    return { recurso, resolucion: p, rechazados, descartesDeCompra, candidatos: candidatos.length }
  })
  return { resoluciones, comprasLeidas: compras.length, recursosLeidos: recursos.length }
}

/**
 * CUÁNTO PESA CADA RECURSO EN UNA COTIZACIÓN CONCRETA. UNA consulta.
 *
 * ═══ POR QUÉ ESTO NO ES UN LUJO ═══
 *
 * La materialidad es la entrada que decide si un precio viejo frena la oferta o no, y sólo existe
 * DENTRO de una cotización: en el catálogo suelto, el TORNILLO AUTOPERFORANTE y el PANEL DE CHAPA
 * pesan lo mismo (nada), porque no hay cantidades. Correr la resolución sobre el catálogo sin pesos
 * es medir el peor caso; correrla sobre una cotización es medir el caso real.
 *
 * El peso es `cantidad de partida × cantidad de la composición × precio del recurso`, normalizado
 * sobre el total. Se usa el precio que HAY —viejo o no— porque para pesar sirve el orden de
 * magnitud, no la exactitud: un recurso que representa el 30% con precios de 2022 sigue
 * representando cerca del 30% con precios de 2026 mientras la inflación los mueva a todos.
 */
export async function pesosDeCotizacion({ query }, cotizacionId) {
  const { rows } = await query(
    `select r.codigo, sum(p.cantidad * al.cantidad * coalesce(rp.costo, 0)) as monto
       from public.cotizacion_partida p
       join public.analisis_linea al on al.analisis_id = p.analisis_id
       join public.recurso r on r.id = al.recurso_id
       left join public.recurso_precio rp on rp.recurso_id = r.id and rp.vigente is true
      where p.cotizacion_id = $1 and p.cantidad is not null
      group by r.codigo`, [cotizacionId])
  const total = rows.reduce((a, r) => a + Number(r.monto ?? 0), 0)
  const pesos = {}
  // Con total 0 no se normaliza nada: devolver ceros diría «ningún recurso importa», que es
  // justamente la mentira que `materialidadDe` existe para no contar. Se devuelve vacío y cada
  // recurso queda con materialidad desconocida, que es la verdad.
  if (!(total > 0)) return { pesos, total: 0, porQue: 'ningún recurso de esta cotización tiene precio cargado: no se puede pesar nada' }
  for (const r of rows) if (Number(r.monto) > 0) pesos[r.codigo] = Number(r.monto) / total
  return { pesos, total, porQue: `${Object.keys(pesos).length} recursos pesados sobre un costo de referencia de $${total.toLocaleString('es-AR')}` }
}

/**
 * GUARDAR LA EVIDENCIA DE UNA RESOLUCIÓN. Sólo INSERT — la tabla no tiene GRANT de UPDATE.
 *
 * El CHECK `sin_precio_no_es_cero` de la migración es el que hace cumplir el invariante en la BASE:
 * si algún día el motor intentara escribir un SIN_PRECIO con valor, o un resuelto con 0, la
 * transacción falla acá y no publica un total con cara de completo.
 */
export async function guardarResolucion({ query }, { recurso, resolucion }) {
  const p = resolucion
  const { rows } = await query(
    `insert into public.recurso_precio_resolucion
       (recurso_id, recurso_codigo, resultado, valor, moneda, fuente, detalle_fuente, fecha_precio,
        vigencia_dias, vence_el, origen_deriva, resuelto_en, materialidad, evidencia, provenance, por_que)
     values ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10::date,$11,$12,$13,$14::jsonb,$15::jsonb,$16)
     returning id, recurso_codigo, resultado, valor`,
    [recurso.id ?? null, p.recurso, p.resultado, p.valor, p.moneda, p.fuente, p.detalleFuente, p.fecha,
      p.vigencia?.dias ?? null, p.vigencia?.venceEl ?? null, p.vigencia?.origenDeriva ?? null,
      p.provenance.resueltoEn, p.provenance.materialidad?.fraccion ?? null,
      JSON.stringify(p.evidencia ?? null), JSON.stringify(p.provenance), p.porQue])
  return rows[0]
}

/**
 * ESCRIBIR EL PRECIO CONSEGUIDO EN EL CATÁLOGO. El paso 6: «actualizar SÓLO lo necesario».
 *
 * ═══ QUÉ SE ACTUALIZA Y QUÉ NO ═══
 *
 * Sólo `ACTUALIZADO`: el sistema encontró un precio nuevo, defendible, y el cotejo contra el que
 * había NO exigió una firma. `VIGENTE` no toca nada (no hay nada que arreglar), y `NECESITA_HUMANO`
 * y `SIN_PRECIO` tampoco: escribirlos sería exactamente la autonomía que el programa NO pide.
 *
 * ═══ POR QUÉ INSERT Y NO UPDATE ═══
 *
 * **PISAR LA FILA GARANTIZA QUE LA SERIE NUNCA CREZCA Y QUE LA VOLATILIDAD REAL NUNCA SE PUEDA
 * MEDIR.** No es una preferencia de estilo: es la explicación de un hecho medido. Al 30/08/2026 los
 * 389 recursos del catálogo tienen EXACTAMENTE UNA observación cada uno —ni uno solo tiene dos—, y
 * por eso `derivaDeSerie()` no puede disparar en ningún recurso y los 338 caen al IPC nivel general,
 * que es un piso prestado del promedio de la economía y no la deriva del hormigón ni la del gasoil.
 *
 * Ese «1 observación por recurso» no es casualidad ni falta de historia: es la firma de una carga
 * que siempre sobrescribió. Un catálogo que se pisa a sí mismo no tiene pasado, y sin pasado la
 * vigencia sólo se puede estimar desde afuera.
 *
 * Por eso acá se agrega una OBSERVACIÓN NUEVA y se baja `vigente` de las anteriores. La consecuencia
 * es acumulativa y es el punto: a la tercera corrida que consiga un precio, ese recurso tiene tres
 * puntos con fecha, `derivaDeSerie()` empieza a devolver `SERIE_OBSERVADA` en vez de `IPC_INDEC`, y
 * la vigencia pasa de estimada a MEDIDA. El costo de guardar filas de más es despreciable; el de
 * borrarlas es no poder medir nunca.
 */
export async function aplicarResolucion({ query }, { recurso, resolucion }) {
  if (resolucion.resultado !== 'ACTUALIZADO') {
    return { escrito: false, porQue: `«${resolucion.resultado}» no se escribe solo: sólo ACTUALIZADO lo hace` }
  }
  await query('update public.recurso_precio set vigente = false where recurso_id = $1 and vigente is true', [recurso.id])
  const { rows } = await query(
    `insert into public.recurso_precio (recurso_id, costo, fecha_precio, fuente, proveedor, moneda, vigente, vigencia_dias)
     values ($1,$2,$3::date,$4,$5,$6,true,$7)
     returning id, costo, fecha_precio, vigencia_dias`,
    [recurso.id, resolucion.valor, resolucion.fecha,
      `${resolucion.provenance.resueltoEn} · ${resolucion.detalleFuente}`.slice(0, 500),
      resolucion.provenance.resueltoEn === ORIGEN.COMPRA_ECSAS ? (resolucion.evidencia?.proveedor ?? null) : null,
      resolucion.moneda, resolucion.vigencia?.dias ?? null])
  return { escrito: true, fila: rows[0], porQue: resolucion.porQue }
}
