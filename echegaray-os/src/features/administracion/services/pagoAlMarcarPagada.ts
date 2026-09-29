// ═══ QUÉ ESCRIBE «MARCAR PAGADA» CUANDO EL DUEÑO YA ANOTÓ UN IMPORTE ═══
//
// Defecto (29/09/2026): el botón repartía el saldo en banco y efectivo aunque el dueño hubiera tipeado, por ejemplo,
// 200.000 en banco: el saldo restante se «inventaba» en efectivo, un medio de pago que nadie afirmó. Regla del dueño:
// lo que anotó no se borra ni se pisa. Con algo anotado la marca SÓLO sella; el saldo sin cubrir sigue visible como
// saldo pendiente (lo calcula la pantalla con el mismo cálculo de siempre) y no se atribuye a ningún medio.
// Sin nada anotado se conserva el comportamiento de siempre: el saldo compensado se da por pagado.

const r2 = (n: number): number => Math.round(n * 100) / 100

export type PagoAnotado = { banco: number | null; efectivo: number | null }
export type SaldoCompensado = { banco: number | null; efectivo: number | null }

export type PagoAlMarcar = {
  pagadoBanco: number
  pagadoEfectivo: number
  /** true = había algo anotado: se conserva tal cual, incluidas sus cuentas (fórmulas). */
  conservaLoAnotado: boolean
}

/** Distinto de null y de 0: un 0 tecleado es lo mismo que la celda vacía para esta regla. */
const hayImporte = (n: number | null | undefined): boolean => n != null && Number.isFinite(n) && n !== 0

export function pagoAlMarcarPagada(anotado: PagoAnotado, saldo: SaldoCompensado): PagoAlMarcar {
  if (hayImporte(anotado.banco) || hayImporte(anotado.efectivo)) {
    return { pagadoBanco: r2(anotado.banco ?? 0), pagadoEfectivo: r2(anotado.efectivo ?? 0), conservaLoAnotado: true }
  }
  // Un saldo negativo (cobró de más) no se «paga»: queda como está y la marca sólo sella.
  return {
    pagadoBanco: r2(Math.max(0, saldo.banco ?? 0)),
    pagadoEfectivo: r2(Math.max(0, saldo.efectivo ?? 0)),
    conservaLoAnotado: false,
  }
}
