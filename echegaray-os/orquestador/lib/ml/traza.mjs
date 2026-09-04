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
const pendientes = new Set()

/** Escribe la traza. No se espera y no se propaga: `resolver()` la dispara y sigue. */
export function registrarTraza(r, { modulo = null, ejecutar = query } = {}) {
  if (!r || !r.traceId) return
  const fila = [
    r.traceId, r.capacidad ?? null, modulo, r.metodo, r.modelo ?? null, r.proveedor ?? null,
    Number.isFinite(r.ms) ? Math.round(r.ms) : null,
    r.confianza == null ? null : Number(r.confianza),
    r.accion ?? null, Boolean(r.huboFallback), r.costoUsd ?? null, r.sensibilidad ?? null,
    r.metodo !== 'sin-resolver', r.metodo === 'sin-resolver' ? 'sin_resolver' : null,
  ]
  const p = ejecutar(
    `insert into orq.ml_traza (trace_id, capacidad, modulo, metodo, modelo, proveedor, ms,
                               confianza, accion, hubo_fallback, costo_usd, sensibilidad, ok, error_kind)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, fila)
    .catch((e) => {
      if (avisado) return
      avisado = true
      console.warn(`  ⚠ la traza ML no se pudo escribir (se sigue igual): ${e.message.slice(0, 90)}`)
    })
  pendientes.add(p)
  p.finally(() => pendientes.delete(p))
}

/**
 * Espera a que las trazas disparadas terminen de escribirse.
 *
 * `registrarTraza()` no se espera a propósito: la operación del negocio no puede depender de la
 * medición. Pero casi todo el OS son scripts cortos que corren por timer y terminan enseguida — y
 * un proceso que sale antes de que el INSERT llegue a Postgres pierde la fila sin decir nada. Eso
 * ya pasó: el humo de la Fase 3 resolvió once proveedores y `orq.ml_traza` quedó en cero.
 *
 * Un script que use la capa ML llama a esto antes de salir. Un servicio largo no lo necesita.
 */
export async function drenarTrazas({ msMax = 3000 } = {}) {
  if (pendientes.size === 0) return 0
  const cuantas = pendientes.size
  await Promise.race([
    Promise.allSettled([...pendientes]),
    new Promise((r) => setTimeout(r, msMax).unref?.()),
  ])
  return cuantas
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
