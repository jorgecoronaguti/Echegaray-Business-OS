// LA FECHA DEL PAGO EN EFECTIVO (dueño, 02/10/2026): un pago en efectivo de Liquidación baja la caja el día en que SALIÓ
// la plata, no el día en que se cargó. La base ya lo sabe resolver (trigger de `liquidacion_linea`, migración
// 20261002T1800): por defecto es hoy, y la app sólo manda la fecha cuando alguien la cambió.
//
// Por qué la fecha de hoy NO viaja: mandar siempre la columna puente obligaría a que la migración esté aplicada para
// guardar CUALQUIER celda de efectivo. Si no se tocó la fecha, la escritura es la de siempre y el trigger pone hoy.
import { z } from 'zod'

export const COLUMNA_FECHA_DEL_PAGO = 'fecha_pago_efectivo'
export const MIGRACION_FECHA_DEL_PAGO = '20261002T1800_liquidacion_pago_efectivo_baja_la_caja.sql'

/** Día calendario válido (`2026-02-31` no lo es: `Date` lo corre a marzo sin avisar). */
export const fechaDelPagoSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha del pago inválida')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
  }, 'Fecha del pago inválida')

export type FechaDelPago = { ok: true; puente: Record<string, string> } | { ok: false; error: string }

/**
 * Lo que hay que agregar a la escritura de la línea. Sin fecha, o con la de hoy, nada (el trigger usa hoy).
 * Una fecha futura se rechaza acá con palabras; la base la rechaza igual si llegara otra vía.
 */
export function puenteDeLaFecha(fecha: string | undefined, hoy: string): FechaDelPago {
  if (fecha == null || fecha === hoy) return { ok: true, puente: {} }
  if (fecha > hoy) return { ok: false, error: 'El pago en efectivo no puede tener fecha futura.' }
  return { ok: true, puente: { [COLUMNA_FECHA_DEL_PAGO]: fecha } }
}

/**
 * Igual que `puenteDeLaFecha`, pero cuando HAY fecha preguntada si la base ya tiene la columna: una fecha elegida que
 * se descartara en silencio dejaría el pago con la fecha de hoy y nadie se enteraría. Se frena y se dice qué falta.
 */
export async function puenteParaElPago(
  fecha: string | undefined, hoy: string, columnaExiste: () => Promise<boolean>,
): Promise<FechaDelPago> {
  const r = puenteDeLaFecha(fecha, hoy)
  if (!r.ok || Object.keys(r.puente).length === 0) return r
  if (await columnaExiste()) return r
  return { ok: false, error: `Falta aplicar la migración ${MIGRACION_FECHA_DEL_PAGO} para guardar la fecha del pago. No guardé nada.` }
}
