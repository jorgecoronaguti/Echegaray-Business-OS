// CUÁNTO CUESTA ESTAR EN DESCUBIERTO, POR DÍA.
//
// EL PEDIDO (21/07). "Te pasé las tasas del acuerdo de descubierto para que al momento de utilizarlo
// el Sheet de manera automática indique los intereses que va generando."
//
// ═══ EL MODELO NO SE ESTIMÓ: SE VERIFICÓ CONTRA EL CARGO REAL DEL BANCO ═══
//
// El extracto del 14/07 trae el cobro del período 08/06 al 07/07 desglosado en tres líneas, y las
// tres cierran exactas contra la tasa:
//
//   Cobro de interés por descubierto      $252.340,32
//   IVA 10,5% Reg Trans Fisc Ley 27743     $26.495,73  =  252.340,32 × 0,105   ✓ al centavo
//   IVA percep RG 2408 alícuota reducida    $3.785,10  =  252.340,32 × 0,015   ✓ al centavo
//   ─────────────────────────────────────────────────
//   Costo total                           $282.621,15  =  interés × 1,12
//
// Que las dos alícuotas den EXACTAS no es una coincidencia: confirma que el interés se factura con
// IVA al 10,5% más una percepción del 1,5%, y que el número que sale de la cuenta es el interés por
// 1,12. Sin esa verificación esto sería una tasa copiada de una pantalla; con ella, es un modelo que
// reproduce lo que el banco cobró.
//
// PRUEBA DE PLAUSIBILIDAD DE LA TNA: con 55% anual y 30 días, $252.340,32 de interés implican un
// saldo promedio en rojo de $5.582.074 durante ese mes. El extracto muestra la cuenta entre
// −$540.014 y −$12.095.024 en esos días, así que el promedio es del orden correcto. Es una
// verificación de magnitud, no una demostración: no tengo los saldos diarios del 08/06 al 02/07.
//
// LO QUE NO SE PUEDE HACER, Y POR QUÉ. Proyectar el interés sobre el saldo de CIERRE de cada mes
// crearía una referencia circular en el Sheet: el interés cambia el cierre y el cierre cambia el
// interés. Por eso la proyección usa el saldo con el que ARRANCA el mes —el cierre del mes
// anterior, que ya está calculado— y por eso es un PISO: no cobra intereses por la deuda que se
// toma dentro del mismo mes. El mes en que la caja se da vuelta va a mostrar $0 y no es un error,
// es el límite del método, y está escrito en la propia fila.

/** Las tasas del acuerdo. Todas verificadas contra el cargo real del 14/07 (ver el encabezado). */
export const TASAS = {
  tna: 0.55,          // tasa nominal anual del acuerdo N° 00007
  iva: 0.105,         // IVA sobre intereses, Reg. Trans. Fiscal Ley 27743
  percepcion: 0.015,  // IVA percepción RG 2408, alícuota reducida
  base: 365,          // el banco liquida por día sobre año de 365
}

/** El cargo real contra el que se verificó el modelo. Es evidencia, no un supuesto. */
export const CARGO_VERIFICADO = {
  desde: '2026-06-08',
  hasta: '2026-07-07',
  dias: 30,
  interes: 252340.32,
  iva: 26495.73,
  percepcion: 3785.10,
  total: 282621.15,
}

/** NÚCLEO PURO: la tasa por día. Es el número con el que se piensa un descubierto. */
export const tasaDiaria = (tna = TASAS.tna) => tna / TASAS.base

/**
 * NÚCLEO PURO: el interés que genera un saldo NEGATIVO durante una cantidad de días.
 * Un saldo positivo no genera interés: devuelve 0, no un número negativo.
 * @param {number} saldo el saldo de la cuenta (negativo = descubierto)
 * @param {number} dias
 * @returns {number} el interés, SIN impuestos
 */
export function interesDelPeriodo(saldo, dias, tna = TASAS.tna) {
  const s = Number(saldo)
  const d = Number(dias)
  if (!Number.isFinite(s) || !Number.isFinite(d) || d <= 0 || s >= 0) return 0
  return Math.abs(s) * tasaDiaria(tna) * d
}

/**
 * NÚCLEO PURO: lo que sale de la cuenta = interés + IVA + percepción.
 * Es el número que importa para la caja: el interés solo subestima el costo un 12%.
 */
export function costoConImpuestos(interes) {
  const i = Number(interes) || 0
  return i * (1 + TASAS.iva + TASAS.percepcion)
}

/**
 * NÚCLEO PURO: qué saldo promedio en rojo explica un interés ya cobrado.
 * Sirve para leer el extracto al revés: el banco cobra un importe y esto dice cuánta plata prestada
 * hubo detrás. Es la única forma de controlar un cargo sin tener los saldos diarios.
 */
export function saldoPromedioImplicito(interes, dias, tna = TASAS.tna) {
  const d = Number(dias)
  if (!d || d <= 0) return null
  return Number(interes) / (tasaDiaria(tna) * d)
}

/**
 * NÚCLEO PURO: la fórmula del Sheet que proyecta el interés de un mes.
 * @param {string} saldoInicial celda del saldo con el que arranca el mes (cierre del mes anterior)
 * @param {string} celdaMes celda con el primer día del mes, para contar sus días
 */
export function formulaInteresMes(saldoInicial, celdaMes) {
  const diaria = `${TASAS.tna}/${TASAS.base}`
  const conImp = `*(1+${TASAS.iva}+${TASAS.percepcion})`
  return `=IF(N(${saldoInicial})>=0;0;-${saldoInicial}*${diaria}*DAY(EOMONTH(${celdaMes};0))${conImp})`
}
