// QUÉ FILA DE COMPRAS ES UN COSTO DE OBRA — la regla, suelta del script (que al importarse ejecuta main()).

/**
 * QUÉ FILA DE COMPRAS ES UN COSTO DE OBRA. Exportada para el test.
 *
 * Una fila ELIMINADO (la marca del dueño: X = ELIMINADO e importe en 0) NO es un costo, aunque la
 * columna Importe conserve el número: el bisturí pone en 0 el Total cuando es un valor pegado y
 * deja el Importe, y `c.total || c.importe` volvía a leer ese Importe. Así entraron 4 filas de
 * «Sueldos» por $8.346.650 al costo real de San Francisco, La Estrella y Messina (12/09/2026). Un
 * total en 0 es un dato, no una ausencia: no se reemplaza por el importe.
 */
export function esCostoDeObra(c) {
  if (!c?.obra_texto) return false
  if (String(c.estado ?? '').trim().toUpperCase() === 'ELIMINADO') return false
  if (c.anulada) return false
  const total = c.total ?? c.importe
  return Number(total) > 0
}

