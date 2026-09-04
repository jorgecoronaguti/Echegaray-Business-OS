// LA TRAZA DE LA CAPA ML. UNA FILA POR OPERACIÓN, SIN GUARDAR LO QUE SE PROCESÓ.
//
// ═══ QUÉ SE GUARDA Y QUÉ NO ═══
//
// Se guarda CÓMO se resolvió: capacidad, método, modelo, latencia, confianza, si hubo fallback, la
// sensibilidad del dominio y el trace_id. NO se guarda el texto, ni el documento, ni el nombre del
// proveedor que se estaba resolviendo. La pregunta que esta tabla contesta es «qué modelos usa hoy
// producción y cuánto cuestan», y para eso el contenido no hace falta — guardarlo sería crear un
// segundo lugar donde vive información sensible, con la excusa de medir.
//
// Es la contraparte de `orq.chat_cost`, que hace lo mismo para Claude y tampoco guarda el prompt.
//
// ═══ POR QUÉ NUNCA PUEDE ROMPER LA OPERACIÓN ═══
//
// Si Postgres no está, la resolución de un proveedor tiene que seguir funcionando. Se escribe sin
// esperar y el error se traga con un aviso: perder una fila de medición es barato; frenar una
// operación del negocio porque no se pudo medir, no.

import { query } from '../db.mjs'

let avisado = false

/** Escribe la traza. No se espera y no se propaga: `resolver()` la dispara y sigue. */
export function registrarTraza(r, { modulo = null } = {}) {
  if (!r || !r.traceId) return
  const fila = [
    r.traceId, r.capacidad ?? null, modulo, r.metodo, r.modelo ?? null, r.proveedor ?? null,
    Number.isFinite(r.ms) ? Math.round(r.ms) : null,
    r.confianza == null ? null : Number(r.confianza),
    r.accion ?? null, Boolean(r.huboFallback), r.costoUsd ?? null, r.sensibilidad ?? null,
    r.metodo !== 'sin-resolver', r.metodo === 'sin-resolver' ? 'sin_resolver' : null,
  ]
  query(
    `insert into orq.ml_traza (trace_id, capacidad, modulo, metodo, modelo, proveedor, ms,
                               confianza, accion, hubo_fallback, costo_usd, sensibilidad, ok, error_kind)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, fila)
    .catch((e) => {
      if (avisado) return
      avisado = true
      console.warn(`  ⚠ la traza ML no se pudo escribir (se sigue igual): ${e.message.slice(0, 90)}`)
    })
}

/** Qué usó producción y cuánto tardó, por capacidad. Es la respuesta a la pregunta del dueño. */
export async function resumen({ dias = 30 } = {}) {
  const q = await query(
    `select capacidad, metodo, coalesce(modelo,'—') modelo, count(*) n,
            round(avg(ms)) ms_prom, round(percentile_cont(0.95) within group (order by ms)) ms_p95,
            round(avg(confianza)::numeric, 3) conf_prom,
            count(*) filter (where hubo_fallback) fallbacks,
            coalesce(sum(costo_usd), 0) usd
     from orq.ml_traza where ts > now() - ($1 || ' days')::interval
     group by 1,2,3 order by n desc`, [String(dias)])
  return q.rows
}
