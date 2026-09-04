// EL SERVICIO DE IDENTIDAD: PADRÓN, ALIASES, RESOLUCIÓN Y SU RASTRO. UNA PUERTA PARA TODO EL OS.
//
// `entity-resolution.mjs` es el núcleo PURO —decide sin tocar nada—. Esto es lo que lo conecta con
// la base: trae el padrón, trae los aliases verificados, resuelve y deja la decisión escrita para
// que se pueda deshacer y medir.
//
// Sirve para cualquier entidad. Se empieza por proveedores porque es la única con ground truth
// medido, pero no hay una línea específica de proveedores acá: la entidad entra por parámetro.

import { query } from '../db.mjs'
import { normalizar } from './embeddings.mjs'
import { resolverIdentidad, ESTADO, VERSION, cuitCanonico } from './entity-resolution.mjs'
import { umbralesDe, configUmbrales } from './umbrales.mjs'

/** El padrón de una entidad. Hoy sólo proveedores tiene tabla propia; el resto se agrega acá y el
 *  resolver no cambia. */
const PADRONES = {
  proveedor: async () => (await query(
    `select id::text as id, nombre, cuit from public.proveedores where coalesce(activo, true) and coalesce(es_prueba, false) = false`
  )).rows,
  cliente: async () => (await query(`select id::text as id, nombre, cuit from public.clientes`)).rows,
}

export async function padronDe(entidad) {
  const f = PADRONES[entidad]
  if (!f) throw new Error(`no hay padrón declarado para «${entidad}»`)
  return f()
}

/** Los aliases verificados de una entidad, listos para el resolver. */
export async function aliasesDe(entidad) {
  const q = await query(
    `select alias_norm, entidad_id from public.ml_entidad_alias where entidad = $1 and verificado`, [entidad])
  return new Map(q.rows.map((r) => [r.alias_norm, r.entidad_id]))
}

/**
 * Resuelve y DEJA RASTRO. Es la función que usan los módulos.
 *
 * `persistir: false` para los benchmarks: medir no tiene que ensuciar la tabla de decisiones.
 */
export async function resolver({ nombre, cuit = null, entidad = 'proveedor', fuente = null, traceId = null, persistir = true, padron = null, aliases = null }) {
  const u = umbralesDe(entidad)
  const p = padron ?? await padronDe(entidad)
  const a = aliases ?? await aliasesDe(entidad)
  const r = await resolverIdentidad({ nombre, cuit }, p, { umbrales: u, aliases: a, entidad })

  if (persistir) {
    await query(
      `insert into public.ml_resolucion (trace_id, entidad, valor_original, cuit_original, fuente,
                                         entidad_id, estado, metodo, confianza, señales, por_que,
                                         resolver_version, umbrales_version)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [traceId, entidad, String(nombre ?? ''), cuitCanonico(cuit), fuente,
       r.match?.id ?? null, r.estado, metodoDe(r.señales), r.confianza ?? null,
       JSON.stringify(r.señales ?? {}), r.porQue, VERSION, configUmbrales().version])
      .catch((e) => console.warn(`  ⚠ no se pudo persistir la resolución (se sigue): ${e.message.slice(0, 80)}`))
  }
  return { ...r, umbrales: u }
}

/** Qué señal ganó, para poder agrupar decisiones por método sin releer el jsonb. */
function metodoDe(s = {}) {
  if (s.strong_id_score === 1) return 'strong_id'
  if (s.exact_score === 1) return 'exacto'
  if (s.alias_score === 1) return 'alias'
  if (s.embedding_score != null && s.embedding_score >= (s.fuzzy_score ?? 0)) return 'embedding'
  if (s.fuzzy_score != null) return 'fuzzy'
  return 'ninguno'
}

/**
 * LA CORRECCIÓN DE UNA PERSONA. Es la más valiosa de todas: cierra el bucle.
 *
 * Marca la decisión como corregida, y —si la persona confirmó una identidad— deja el alias
 * VERIFICADO, para que la próxima vez ese mismo texto se resuelva solo y sin modelo. Es así como
 * «Corralon Progreso» = «PEREZ GARCIA MARISOL BIBIANA» pasa de imposible a instantáneo.
 */
export async function corregir({ resolucionId, entidadIdCorrecta, por, crearAlias = true }) {
  const q = await query(
    `update public.ml_resolucion
        set corregido_por = $2, corregido_en = now(), entidad_id_correcta = $3, estado = 'verificado_humano'
      where id = $1 returning entidad, valor_original`, [resolucionId, por, entidadIdCorrecta ?? null])
  if (!q.rows.length) return { ok: false, porQue: `no existe la resolución ${resolucionId}` }
  const { entidad, valor_original: valor } = q.rows[0]
  if (crearAlias && entidadIdCorrecta) {
    await query(
      `insert into public.ml_entidad_alias (entidad, entidad_id, alias, alias_norm, fuente, confianza, verificado, verificado_por)
       values ($1,$2,$3,$4,'correccion-humana',1,true,$5)
       on conflict (entidad, alias_norm) do update set entidad_id = excluded.entidad_id, verificado = true, verificado_por = excluded.verificado_por`,
      [entidad, String(entidadIdCorrecta), valor, normalizar(valor), por])
  }
  return { ok: true, entidad, valor, alias: crearAlias && entidadIdCorrecta ? normalizar(valor) : null }
}

/** Lo que quedó esperando a una persona. Es la cola de trabajo, no un dashboard. */
export async function pendientes({ entidad = null, limite = 50 } = {}) {
  const q = await query(
    `select id, entidad, valor_original, estado, confianza, por_que, ts
       from public.ml_resolucion
      where estado in ('sugerido','ambiguo') and corregido_en is null
        and ($1::text is null or entidad = $1)
      order by ts desc limit $2`, [entidad, limite])
  return q.rows
}

export { ESTADO }
