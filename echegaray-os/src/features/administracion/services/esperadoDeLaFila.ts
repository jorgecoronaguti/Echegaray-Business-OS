// CONTRA QUÉ CIERRA UNA FILA, ESCRITO UNA SOLA VEZ (dueño, 02/10/2026: «un concepto se define una sola vez»).
//
// La cuenta estaba escrita a mano en tres lugares: `cierreDeLaFila` (la fila y el pie), `totalGeneral` (el total
// general) y `delJornalero` (la foto que sella el cierre). Cuando la resta del recibo anterior pasó a sumarse sólo al
// banco, se cambió en uno y dos quedaron con la regla vieja: el pie dijo «no cierra por $372.254,72» y el cierre de la
// Q2-09 fue rechazado. Con una sola función, cambiar la regla es cambiarla para los tres; `esperadoDeLaFila.test.ts`
// lee los tres archivos y falla si alguno vuelve a escribir la cuenta.
//
// Puro: sin base, sin imports.

const r2 = (n: number): number => Math.round(n * 100) / 100

/** La resta de un recibo anterior que esta quincena paga por banco (`liquidacionArrastre.ts`). Sólo la aplicada cuenta. */
export interface RestaDelReciboAnterior {
  importe: number
  estado: string
}

/** La parte del banco que es resta de otro recibo. 0 sin resta, o con una que no se aplicó. */
export const restaAplicada = (arrastre: RestaDelReciboAnterior | null | undefined): number =>
  arrastre?.estado === 'aplicado' ? arrastre.importe : 0

/**
 * LO QUE LA FILA TIENE QUE SUMAR:  COBRA − ADELANTO − YA TRANSFERIDO + RESTA APLICADA.
 *
 * La resta se suma (dueño, 02/10/2026): no es sueldo de esta quincena —`cobra` no la trae— pero sí se paga en ésta, por
 * banco, así que lo que falta pagar es lo ganado + la resta. Adelanto y ya transferido son lo pagado antes por fuera de
 * la fila; quien compara los LADOS de la fila (banco + efectivo, que todavía no descuentan lo pagado) los deja en 0.
 */
export function esperadoDeLaFila(c: {
  cobra: number
  adelanto?: number
  yaTransferido?: number
  arrastre?: RestaDelReciboAnterior | null
}): number {
  return r2(c.cobra - (c.adelanto ?? 0) - (c.yaTransferido ?? 0) + restaAplicada(c.arrastre))
}
