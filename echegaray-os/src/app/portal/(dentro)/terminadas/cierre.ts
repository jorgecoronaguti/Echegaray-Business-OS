// EL CIERRE DE UNA OBRA TERMINADA — cobrado, pendiente, fondo de reparo, duración, comprobantes.
//
// ═══ DEJÓ DE LEER `pago_programado` (10/09/2026) ═══
//
// Era el ÚLTIMO lector de `pago_programado` en el portal: la tabla que el portal se había creado para
// sí mismo antes de que el cronograma pasara a `esquema_pago` el 26/08. Como esa tabla no se
// alimenta más, esta función devolvía CEROS para todas las obras y la pantalla escribía «sin datos
// de cobro» sobre obras enteramente cobradas. Un cero que nadie contradice se lee como un hecho.
//
// Ahora la cuenta sale de los MISMOS pagos que dibuja la pantalla de Pagos —`esquema_pago` refrescado
// contra Cobranzas en vivo—, así que las dos pantallas no pueden discrepar: son el mismo número
// sumado en dos lugares distintos. Y por eso esto es PURO: entra la lista de pagos de la obra, sale
// su cierre, y se puede probar sin base.

import type { PagoConObra } from '../../esquema'

export type ObraCerrada = {
  cobrado: number
  pendiente: number
  rotuloCobro: string
  /** Lo retenido y todavía no devuelto. `0` = no queda nada abierto. */
  faltaReparo: number
  reparoDevueltoEn: string | null
  meses: number | null
  /** Cuántos de sus pagos tienen número de factura y de recibo. */
  facturas: number
  recibos: number
}

/**
 * CUÁNTOS MESES DURÓ. `null` cuando falta una fecha o cuando no llega a un mes.
 *
 * SE CUENTA SOBRE EL TEXTO DE LA FECHA, NO SOBRE UN `Date`. `new Date('2026-05-01')` es medianoche
 * UTC, que en San Juan (UTC−3) es el 30/04 a las 21:00: `getMonth()` devolvía ABRIL y una obra de
 * mayo a agosto se publicaba como «4 meses». Una fecha sin hora es un día del calendario, no un
 * instante, y tratarla como instante corre el mes en la cara del cliente.
 */
export function mesesEntre(desde: string | null, hasta: string | null): number | null {
  const partes = (f: string) => [Number(f.slice(0, 4)), Number(f.slice(5, 7))]
  if (!desde || !hasta) return null
  const [ay, am] = partes(desde)
  const [by, bm] = partes(hasta)
  if (!ay || !am || !by || !bm) return null
  const m = (by - ay) * 12 + (bm - am)
  return m > 0 ? m : null
}

/**
 * EL CIERRE DE UNA OBRA, a partir de sus pagos publicados.
 *
 * @param pagos SÓLO los de esa obra. Filtrar acá adentro obligaría a pasar el id y a confiar en que
 *   quien llama no mezcló clientes; con la lista ya recortada, el error es imposible de cometer.
 *
 * LAS SUMAS SON EN BRUTO, como las escribe Cobranzas: acá no se compara contra el contrato —eso lo
 * hace el pie de Pagos, que trabaja en neto— sino que se dice cuánta plata entró y cuánta falta.
 */
export function cierreDeObra(
  pagos: PagoConObra[], desde: string | null, hasta: string | null,
): ObraCerrada {
  let cobrado = 0, pendiente = 0, faltaReparo = 0, facturas = 0, recibos = 0
  let reparoDevueltoEn: string | null = null
  for (const p of pagos) {
    if (p.facturaNumero) facturas++
    if (p.reciboNumero) recibos++
    if (p.tipo === 'fondo_reparo') {
      if (p.devueltoEn) reparoDevueltoEn = p.devueltoEn
      else if (p.monto != null) faltaReparo += p.monto
      continue
    }
    // NULL NO ES CERO: un pago sin importe no suma ni a un lado ni al otro. Contarlo como 0 en
    // «cobrado» diría que se cobró algo que vale nada.
    if (p.monto == null) continue
    if (p.fechaPago) cobrado += p.monto
    else pendiente += p.monto
  }

  return {
    cobrado, pendiente, faltaReparo, reparoDevueltoEn, facturas, recibos,
    // «pagada» sólo cuando NO queda nada. Con un peso pendiente se dice el número.
    rotuloCobro: pendiente === 0 && cobrado > 0 ? 'pagada' : pendiente > 0 ? 'con saldo' : 'sin datos de cobro',
    meses: mesesEntre(desde, hasta),
  }
}
