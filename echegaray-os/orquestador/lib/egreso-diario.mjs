// EL RITMO DE EGRESO REAL, PARA QUE "DÍAS DE CAJA" NO MIENTA.
//
// POR QUÉ EXISTE (21/07). La métrica "días de caja" dividía la disponibilidad neta por un egreso
// diario que salía SÓLO de Compras: `SUMIFS(Compras!O; …últimos 90 días…)/90`. Dos problemas, y
// los dos hacen que el número tranquilice de más:
//
//   1. COMPRAS ES DEVENGADO, NO PAGADO. Una compra a 60 días entra en el promedio el día que se
//      cargó, no el día que se paga. El ritmo de SALIDA de caja no es el ritmo de COMPRA.
//   2. COMPRAS NO ES TODO LO QUE SE PAGA. Los sueldos ($31,4M/mes), las cargas sociales, los
//      impuestos y el servicio de deuda ($3M/mes) salen de la cuenta y no están en Compras. Medido:
//      los egresos totales de la empresa son ~$72,5M/mes; Compras sola da $69M/mes por CASUALIDAD
//      —incluye compras a crédito que compensan lo que le falta—. El día que suba un sueldo o caiga
//      un impuesto grande, la métrica no lo ve.
//
// LA FUENTE CORRECTA YA EXISTE: el Cash Flow Mensual reparte TODOS los egresos por fecha de caja
// (criterio percibido), sumando las seis categorías. Un mes ya cerrado de ese cuadro ES el egreso
// real de ese mes. Así que el ritmo sale de promediar los meses cerrados —reales, completos, sin
// proyección— y no de una sola pestaña.
//
// POR QUÉ MESES CERRADOS Y NO EL MES EN CURSO: el mes en curso está a mitad de camino y su egreso
// parcial dividido por 30 subestima. Un mes terminado es un dato; medio mes es una foto borrosa.

/** Las filas de subtotal de egreso del Cash Flow Mensual. Son positivas; el flujo neto las resta. */
export const FILAS_EGRESO = [10, 17, 21, 24, 29, 34]
export const HOJA = 'Cash Flow Mensual'
/** La fila con los meses (01/01, 01/02, …) y el rango de columnas de datos. */
export const FILA_MESES = 3
export const COL_INI = 'B'
export const COL_FIN = 'M'

/** Días promedio de un mes. Se usa para pasar de egreso mensual a diario; es una aproximación
 *  declarada, no un dato: ningún mes tiene 30,44 días, pero el promedio sobre el año sí. */
export const DIAS_MES = 30.44

// EL NOMBRE DE HOJA VA ENTRE COMILLAS SIMPLES. "Cash Flow Mensual" tiene espacios, y sin comillas
// Sheets no lo parsea: la fórmula entera daba #ERROR!. Es la misma regla que ya mordió otras veces.
const H = `'${HOJA}'`
const rango = (fila) => `${H}!$${COL_INI}$${fila}:$${COL_FIN}$${fila}`
const rangoMeses = `${H}!$${COL_INI}$${FILA_MESES}:$${COL_FIN}$${FILA_MESES}`

/**
 * NÚCLEO PURO: la expresión que suma las seis categorías de egreso, como array de una fila.
 * Cada término es el rango de una categoría; sumados dan el egreso total de cada mes.
 */
export function egresoMensualArray() {
  return FILAS_EGRESO.map(rango).join('+')
}

/**
 * NÚCLEO PURO: la fórmula del egreso diario promedio, sobre los meses YA CERRADOS.
 *
 * Un mes está cerrado cuando su primer día es anterior al primer día del mes en curso. Se promedia
 * el egreso total de esos meses y se divide por los días promedio de un mes.
 *
 * FALLBACK DECLARADO: si todavía no hay ningún mes cerrado en el cuadro (enero, o un archivo recién
 * empezado), cae a Compras/90 —el criterio viejo— en vez de devolver un error o un cero que diría
 * "no hay egresos". Un cero acá haría que "días de caja" diera infinito.
 *
 * @param {string} compras90 la fórmula vieja, como red de seguridad
 * @returns {string} fórmula es-AR, sin el `=`
 */
export function formulaEgresoDiario(compras90) {
  const egr = egresoMensualArray()
  const inicioMes = 'DATE(YEAR(TODAY());MONTH(TODAY());1)'
  const cerrado = `(${rangoMeses}<>"")*(${rangoMeses}<${inicioMes})`
  const totalCerrados = `SUMPRODUCT(${cerrado}*(${egr}))`
  const cantMeses = `SUMPRODUCT(${cerrado})`
  const promedioDiario = `${totalCerrados}/${cantMeses}/${String(DIAS_MES).replace('.', ',')}`
  // Si no hay meses cerrados, cantMeses = 0 y la división falla: ahí manda el fallback.
  return `IFERROR(IF(${cantMeses}=0;${compras90}/90;${promedioDiario});${compras90}/90)`
}
