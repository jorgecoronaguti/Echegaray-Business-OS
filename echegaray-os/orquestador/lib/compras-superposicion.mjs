// LO QUE UNA PERSONA DECIDIÓ EN LA APP Y EL SHEET TODAVÍA NO REFLEJA — qué se superpone al espejo.
//
// ═══ EL PROBLEMA (18/09/2026) ═══
//
// `sync-compras.mjs` lee la pestaña Compras y REESCRIBE `compra_sheet`. Entre esa lectura y la
// escritura, lo que la app guardó por su cuenta (la obra elegida con `compra_obra_asignar`, el pago
// con `compra_pago_registrar`) puede no estar todavía en el Sheet: lo lleva un worker aparte. Para no
// pisarlo, el sync superpone lo pendiente sobre lo leído. Tres agujeros medidos en el código:
//
//   1. Se superponía TODO cambio pendiente de la fila, sin mirar el `tipo`. Un pago en vuelo trae
//      `valor_nuevo = 'total' | 'parcial' | 'deshacer'` (es la acción, no una obra), y
//      `aplicarCambiosPendientes` lo escribía en `obra_celda`: la obra que el dueño eligió quedaba
//      «total» en la app y sin obra en `costos_obra` hasta que el worker terminara.
//   2. Sólo contaban `pendiente` y `procesando`. Un cambio que el worker marcó `aplicado` DESPUÉS de
//      que el sync leyó el Sheet (pero antes de que reescribiera el espejo) no está en la lectura ni
//      en la superposición: el espejo vuelve al valor viejo hasta la corrida siguiente.
//   3. Se leía ANTES de la transacción. Un cambio creado por la app entre esa lectura y el commit del
//      sync se perdía del espejo por el mismo motivo.
//
// Acá vive la regla de QUÉ cuenta, pura y con test. La lectura de la base recibe el `desde` (el
// instante en que el sync empezó a leer el Sheet) y el que llama la repite dentro de la transacción,
// después del lock.

import { aplicarCambiosPendientes } from './obra-destino.mjs'
import { superponerPagosPendientes } from './pagos-pendientes.mjs'

const ms = (t) => (t ? new Date(t).getTime() : NaN)

/** El tipo de un cambio. Las filas anteriores a la migración 20260916T1700 no lo traen: son de obra. */
export const tipoDe = (c) => String(c?.tipo ?? 'obra')

/**
 * ¿Este cambio tiene que superponerse a lo leído del Sheet?
 *
 *   · `pendiente` / `procesando`: el Sheet todavía no lo tiene. Siempre.
 *   · `aplicado` con `aplicado_at >= desde`: el worker lo escribió mientras el sync leía. La lectura
 *     puede o no traerlo; superponer lo mismo que ya está es inocuo, y no superponerlo pisa.
 *   · `rechazado` / `error` / `aplicado` viejo: el Sheet manda (y un rechazo es justamente «el Sheet
 *     dijo otra cosa»: superponerlo sería revivir lo que una persona ya contradijo).
 */
export function cuentaParaSuperponer(cambio, desde) {
  const e = String(cambio?.estado ?? '')
  if (e === 'pendiente' || e === 'procesando') return true
  if (e !== 'aplicado') return false
  const a = ms(cambio?.aplicado_at)
  const d = ms(desde)
  return Number.isFinite(a) && Number.isFinite(d) && a >= d
}

/**
 * Reparte lo leído en las dos superposiciones, con la forma que cada función pura espera:
 *   · obras: el ÚLTIMO cambio de obra por fila (el más nuevo gana, como antes).
 *   · pagos: todos, en orden de creación (la aritmética la resuelve `superponerPagosPendientes`).
 */
export function repartir(cambios = [], desde = null) {
  const cuentan = (cambios ?? []).filter((c) => cuentaParaSuperponer(c, desde))
  const obras = new Map()
  const pagos = []
  for (const c of cuentan) {
    if (tipoDe(c) === 'pago') { pagos.push(c); continue }
    if (tipoDe(c) !== 'obra') continue
    const previo = obras.get(Number(c.fila))
    if (!previo || ms(c.creado_at) >= ms(previo.creado_at)) obras.set(Number(c.fila), c)
  }
  return {
    obras: [...obras.values()],
    pagos,
    ids: cuentan.map((c) => String(c.id)).sort(),
  }
}

/** Lo que la app decidió sobre la pestaña Compras y todavía puede no estar en el Sheet. */
export async function leerLoDecididoEnLaApp(q, { desde }) {
  const { rows } = await q(
    `select id, fila, clave, coalesce(to_jsonb(c) ->> 'tipo', 'obra') as tipo, estado, valor_nuevo,
            to_jsonb(c) -> 'celdas' as celdas, to_jsonb(c) -> 'previo' as previo, creado_at, aplicado_at
       from public.compra_obra_cambio c
      where coalesce(to_jsonb(c) ->> 'pestana', 'Compras') = 'Compras'
        and (estado in ('pendiente', 'procesando') or (estado = 'aplicado' and aplicado_at >= $1::timestamptz))
      order by creado_at`,
    [new Date(desde).toISOString()],
  )
  return repartir(rows ?? [], desde)
}

/**
 * Superpone obras y pagos sobre lo leído del Sheet. Devuelve compras NUEVAS (no muta) y los pagos que el
 * Sheet ya contradijo, para que el sync los cierre con el detalle adentro.
 */
export function superponerLoDecidido(compras, { obras = [], pagos = [] } = {}, hoy = undefined) {
  const p = pagos.length ? superponerPagosPendientes(compras, pagos, hoy) : { compras, conflictos: [], superpuestos: 0 }
  const conObras = obras.length ? aplicarCambiosPendientes(p.compras, obras) : p.compras
  return { compras: conObras, conflictos: p.conflictos, superpuestos: p.superpuestos, obras: obras.length }
}

/** ¿El conjunto de cambios que cuentan es el mismo? El sync lo usa para saber si hay que volver a escribir. */
export const mismoConjunto = (a = [], b = []) => a.length === b.length && a.every((x, i) => x === b[i])
