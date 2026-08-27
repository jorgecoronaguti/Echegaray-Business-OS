// MÉTRICAS POR EJECUCIÓN DE CAPACIDAD — sobre el instrumento que ya existe.
//
// No hay telemetría nueva: `orq.chat_request` ya guarda un registro por pedido (capacidad, modelo,
// costo, latencia, desenlace). Le faltaban dos datos para poder medir por capacidad: QUÉ skills se
// activaron y si la respuesta salió sin pagar modelo. Este módulo aporta la REGLA (pura, testeable)
// y la lectura agregada; el que escribe la fila sigue siendo `interactive-server.mjs`.
import { query } from './db.mjs'
import { leerCatalogoDeDisco } from './skill-catalogo.mjs'
import { nivelResuelto } from './elegir-capacidad.mjs'

// La regla de "esto pagó un modelo" ya vivía en el server como `PAID_MODEL`, usada para contar la
// eficiencia del cerebro. Vive acá y el server la importa: dos copias de la misma regla se corrigen
// una sola vez, y la que quede vieja miente sin avisar.
//
// El campo `model` de una respuesta es o bien un modelo real (haiku/sonnet/opus), o bien la etiqueta
// de la capacidad determinística que la resolvió ('briefing', 'agenda', 'caja-proyeccion', 'costo'…).
// 'agente:<slug>' es un especialista del worker: también paga modelo.
export const PAID_MODEL = /^(haiku|sonnet|opus|agente)/i

/** ¿La respuesta pagó un modelo? PURA. */
export function pagoModelo(model) {
  const m = String(model || '')
  return !!m && PAID_MODEL.test(m)
}

// Estados transitorios: no son una ejecución todavía. No se cuentan de un lado ni del otro —
// contarlos como determinísticos inflaría el "resuelto sin LLM" con pedidos que aún no terminaron.
const TRANSITORIOS = new Set(['trabajando', 'cancelado', 'error', ''])

/** 'determinista' | 'llm' | null (transitorio: todavía no es una ejecución). PURA. */
export function resolucionDeRespuesta(model) {
  const m = String(model || '')
  if (TRANSITORIOS.has(m)) return null
  return pagoModelo(m) ? 'llm' : 'determinista'
}

/**
 * EL NIVEL DE LA POLÍTICA con el que se resolvió un pedido: 0 determinístico · 1 capacidad XSAS ·
 * 2 IA liviana · 3 razonamiento. Es lo que permite responder "cuánto se resolvió adentro".
 * Async porque necesita el catálogo (cacheado en memoria tras la primera lectura). Nunca lanza:
 * la telemetría no decide si el OS funciona.
 */
export async function nivelDeLaRespuesta(model, skills) {
  try {
    const resolucionDelChat = resolucionDeRespuesta(model)
    if (resolucionDelChat === null) return null
    const catalogo = resolucionDelChat === 'determinista' ? [] : await leerCatalogoDeDisco({})
    return nivelResuelto(catalogo, { resolucionDelChat, skills: Array.isArray(skills) ? skills : [] })
  } catch { return null }
}

/**
 * Uso real por capacidad: ejecuciones, cuánto se resolvió sin modelo, errores, latencia y costo.
 * Lee `public.v_capacidades_xsas` (catálogo + uso). Devuelve las filas tal cual.
 * @param {{soloUsadas?:boolean, desde?:string}} [opts]
 */
export async function usoPorCapacidad({ soloUsadas = false } = {}) {
  const { rows } = await query(
    `select clave, area, estado_operativo, nivel_ia, ejecuciones, sin_llm, con_llm, pct_sin_llm,
            errores, ms_promedio, usd, ultimo_uso
       from public.v_capacidades_xsas
      ${soloUsadas ? 'where ejecuciones > 0' : ''}
      order by ejecuciones desc, clave`)
  return rows
}

/**
 * APRENDIZAJE DEL RUTEO — no cambia nada solo, muestra la evidencia.
 * Devuelve las capacidades cuya ruta interna FALLA seguido: candidatas a escalar antes (subirlas de
 * nivel) o a corregir. Cambiar la política es una decisión humana y queda en código versionado; un
 * modelo no puede moverla solo, que es la regla del OS para todo lo que decide plata.
 */
export async function rutasQueFallan({ dias = 30, minimo = 3 } = {}) {
  const { rows } = await query(
    `select s.skill, cr.nivel,
            count(*)::int ejecuciones,
            count(*) filter (where cr.outcome in ('error', 'corte_costo', 'corte_iter'))::int fallidas,
            round(100.0 * count(*) filter (where cr.outcome in ('error','corte_costo','corte_iter')) / count(*), 1) pct_fallo
       from orq.chat_request cr, unnest(cr.skills) as s(skill)
      where cr.created_at > now() - ($1 || ' days')::interval
      group by 1, 2
     having count(*) >= $2 and count(*) filter (where cr.outcome in ('error','corte_costo','corte_iter')) > 0
      order by pct_fallo desc, ejecuciones desc`,
    [String(dias), minimo])
  return rows
}

/**
 * El número global: qué proporción de los pedidos instrumentados se resolvió SIN pagar modelo.
 * Se mide sobre `orq.chat_request`, no sobre el catálogo: acá interesa el pedido, no la skill.
 */
export async function resumenResolucion({ dias = 30 } = {}) {
  const { rows } = await query(
    `select count(*)::int total,
            count(*) filter (where resolucion = 'determinista')::int sin_llm,
            count(*) filter (where resolucion = 'llm')::int con_llm,
            count(*) filter (where nivel = 0)::int nivel_0,
            count(*) filter (where nivel = 1)::int nivel_1,
            count(*) filter (where nivel = 2)::int nivel_2,
            count(*) filter (where nivel = 3)::int nivel_3,
            round(percentile_disc(0.5) within group (order by latency_ms))::int ms_p50,
            round(percentile_disc(0.95) within group (order by latency_ms))::int ms_p95,
            round(sum(coalesce(cost_usd, 0))::numeric, 4) usd
       from orq.chat_request
      where resolucion is not null and created_at > now() - ($1 || ' days')::interval`,
    [String(dias)])
  const r = rows[0] || { total: 0, sin_llm: 0, con_llm: 0, usd: 0 }
  return { ...r, pctSinLlm: r.total ? Math.round((r.sin_llm / r.total) * 1000) / 10 : null }
}
