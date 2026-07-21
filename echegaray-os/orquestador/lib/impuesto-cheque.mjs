// EL IMPUESTO AL CHEQUE — LEY 25.413, 0,6% DE CADA LADO.
//
// POR QUÉ EXISTE (21/07). El cruce del extracto contra el Sheet encontró $625.031 en 18 días de
// costos bancarios sin una sola fila en Compras ni una sola línea en el cash flow. La mitad es el
// impuesto al cheque: se cobra sobre CADA débito y CADA crédito de la cuenta, así que no depende de
// que alguien cargue una factura — no hay factura, lo debita el banco solo.
//
// ═══ VERIFICADO, NO SUPUESTO ═══
//
// El extracto del 04 al 21/07 tiene 10 movimientos de "Impuesto Ley 25.413" por $342.410,27. En esos
// mismos días la cuenta movió $25.737.224 de débitos y $31.873.568 de créditos. Aplicar 0,6% a cada
// lado da $345.665: 99,1% del cargo real. La diferencia es de timing —el impuesto de los últimos
// movimientos se debita al día siguiente— y no de tasa.
//
// La alícuota no la inventé ni la busqué en una pantalla: sale de la ley y la confirma el propio
// extracto, que además la nombra en cada línea ("Impuesto Ley 25.413 Debito 0,6%" y "... Credito
// 0,6%"). Las dos aparecen, así que se cobran las dos.
//
// LO QUE NO CONTEMPLA: la Ley 25.413 tiene exenciones y reducciones (cuentas sueldo, ciertas
// operatorias) y una parte del impuesto es computable como pago a cuenta de Ganancias. Esto proyecta
// la SALIDA DE CAJA bruta, que es lo que el cash flow necesita. El recupero, cuando exista, es un
// tema de la declaración de Ganancias y no de este cuadro.

/** La alícuota de la Ley 25.413, por cada lado del movimiento. */
export const ALICUOTA = 0.006

/** El período contra el que se verificó el modelo. Es evidencia, no un supuesto. */
export const VERIFICACION = {
  desde: '2026-07-04',
  hasta: '2026-07-21',
  debitos: 25737224,
  creditos: 31873568,
  cobrado: 342410.27,
  movimientos: 10,
}

/**
 * NÚCLEO PURO: el impuesto que genera un movimiento de cuenta.
 * Se cobra sobre los dos lados, así que un peso que entra y sale paga 1,2% en total.
 */
export function impuestoDeMovimiento(creditos = 0, debitos = 0) {
  const c = Math.abs(Number(creditos) || 0)
  const d = Math.abs(Number(debitos) || 0)
  return (c + d) * ALICUOTA
}

/**
 * NÚCLEO PURO: qué tan bien reproduce el modelo un cargo real.
 * @returns {number} 1 = exacto
 */
export function precision(v = VERIFICACION) {
  const est = impuestoDeMovimiento(v.creditos, v.debitos)
  return Math.min(est, v.cobrado) / Math.max(est, v.cobrado)
}

/**
 * NÚCLEO PURO: la fórmula del Sheet para una columna del cuadro.
 *
 * NO PUEDE REFERENCIAR EL TOTAL DE EGRESOS: esta línea ES un egreso, así que el total la incluiría y
 * el Sheet devolvería una referencia circular. Por eso recibe la lista explícita de las filas de
 * ingreso y de egreso —todas menos ella misma— y las suma a mano.
 *
 * @param {string} col letra de la columna del período
 * @param {number[]} filasIngreso filas de las líneas que suman
 * @param {number[]} filasEgreso filas de las líneas que restan, SIN incluir esta
 */
export function formulaImpuesto(col, filasIngreso = [], filasEgreso = []) {
  const suma = (fs) => (fs.length ? fs.map((f) => `${col}${f}`).join('+') : '0')
  return `=(${suma(filasIngreso)}+${suma(filasEgreso)})*${ALICUOTA}`
}
