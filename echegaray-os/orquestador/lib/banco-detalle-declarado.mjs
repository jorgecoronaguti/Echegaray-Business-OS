// EL HUECO ENTRE EL SALDO QUE DECLARA EL BANCO Y EL DETALLE QUE TENEMOS CARGADO — DECLARADO EN LA
// PESTAÑA, NO SÓLO EN UN LOG.
//
// ═══ POR QUÉ EXISTE (14/08/2026) ═══
//
// CAJA muestra el saldo DECLARADO por el extracto ($15.982.032,70 al 13/08) y eso está bien: es el
// dato del banco, no un cálculo del OS. Pero los 386 movimientos cargados de `_BANCO_RAW` suman
// $15.936.952,70 — faltan **$45.080**. Ya se investigó: la cadena de saldos se corta en 47 puntos y
// ninguno solo lo explica, es anterior al primer movimiento cargado (28/05) y no hay extracto para
// cerrarlo. `auditar-saldo-banco.mjs` lo dice en cada corrida… en el log del pipeline, que nadie abre.
//
// Un hueco declarado es información: dice hasta dónde llega lo que el archivo puede reconstruir. Un
// hueco callado es una bomba — el día que alguien reconcilie el detalle contra el saldo y le falten
// $45.080 va a buscar un error de carga que no existe, o peor, va a "ajustar" algo para que cierre.
//
// ═══ POR QUÉ NO SE ARREGLA, Y POR QUÉ NO ES UN NÚMERO PEGADO ═══
//
// Arreglarlo requiere un movimiento que sólo tiene el banco. Lo que sí se puede es MEDIRLO en la
// pestaña, con la misma identidad que usa el auditor (`banco-cadena-saldos.mjs · auditarCuenta`):
//
//     saldo inicial + Σ importes = saldo declarado
//
// donde el inicial se deduce de la primera fila (su saldo después menos su propio importe). Todo sale
// de `_BANCO_RAW` con rangos abiertos, así que el día que se cargue el movimiento que falta la línea
// se apaga sola. Ni un importe escrito a mano.

import { DEP, formulaUltimoSaldo } from './caja-posterior-al-corte.mjs'

/** La columna del saldo corrido de la réplica. Las otras tres ya viven en `DEP`. */
export const COL_SALDO = 'D'

/** Un rango abierto de la réplica: `_BANCO_RAW!$C$4:$C`. */
const rango = (col, hoja = DEP.hoja, desde = DEP.desde) => `${hoja}!$${col}$${desde}:$${col}`

/**
 * NÚCLEO PURO: el saldo que el detalle cargado reconstruye — inicial + Σ importes.
 *
 * El inicial NO es un parámetro ni una constante: es `saldo después de la primera fila − su importe`.
 * Escrito como número, envejecería en cuanto se cargue un extracto que empieza antes.
 */
export function expresionDetalle({ importe = DEP.importe, saldo = COL_SALDO } = {}) {
  const C = rango(importe)
  const D = rango(saldo)
  return `(INDEX(${D};1)-INDEX(${C};1))+SUM(${C})`
}

/**
 * NÚCLEO PURO: cuánto falta para que el detalle llegue al saldo declarado. Positivo = faltan ingresos
 * cargados (o sobra un egreso); negativo = al revés.
 */
export function expresionDiferencia(opts = {}) {
  // `formulaUltimoSaldo` es la MISMA que usa CAJA para el saldo del banco: si un día cambia la forma
  // de tomar "el último", este control cambia con ella en vez de quedar midiendo contra otra cosa.
  const declarado = formulaUltimoSaldo(DEP.hoja, opts.saldo ?? COL_SALDO, DEP.desde).slice(1)
  return `${declarado}-(${expresionDetalle(opts)})`
}

/**
 * La fila del anexo que DECLARA el hueco. Devuelve `[rótulo, moneda, importe, '', '', fecha, origen]`
 * — el mismo ancho de las demás filas del bloque A1.
 *
 * EL RÓTULO ES UNA FÓRMULA y no un texto fijo: cuando el hueco se cierre, la línea tiene que decir
 * que cerró. Un aviso que sigue puesto después de resuelto es la forma más rápida de que se deje de
 * leer el resto de la pestaña.
 *
 * @param {number} [tolerancia] pesos por debajo de los cuales el hueco es redondeo, no un faltante.
 */
export function filaHuecoDelExtracto(tolerancia = 1) {
  const dif = expresionDiferencia()
  const C = rango(DEP.importe)
  const A = rango(DEP.fecha)
  const rotulo = `=IF(COUNT(${C})=0;"⚠ Sin extracto cargado: no puedo verificar el saldo del banco";`
    + `IF(ABS(ROUND(${dif};2))<${tolerancia};"✓ El detalle del extracto cierra contra el saldo declarado por el banco";`
    + `"⚠ El detalle del extracto NO cierra contra el saldo que declara el banco — el faltante es anterior al "`
    + `&TEXT(MIN(${A});"d/m/yyyy")&", y no hay extracto para cerrarlo"))`
  return [
    rotulo, 'ARS', `=IF(COUNT(${C})=0;"";ROUND(${dif};2))`, '', '',
    `=IF(COUNT(${A})=0;"";MIN(${A}))`,
    'Saldo declarado por el banco − (saldo inicial + suma de los movimientos de _BANCO_RAW). '
    + 'NO se resta de ninguna disponibilidad: CAJA muestra el saldo del banco, que es el dato real. '
    + 'Mide hasta dónde llega el detalle que el archivo puede reconstruir. Detalle por movimiento: auditar-saldo-banco.mjs.',
  ]
}
