// ¿EL CASH FLOW SEMANAL Y EL MENSUAL CUENTAN LA MISMA EMPRESA?
//
// POR QUÉ EXISTE (04/08). El dueño pidió "revisar cash flow semanal" con el criterio de que la suma
// de las semanas de cada mes dé el mes. Se midió y no da — y lo que aparece no es un redondeo:
//
//     AUMENTO NETO DEL EFECTIVO 2026 · Mensual −$72.302.609 · Semanal +$68.047.829
//
// Los dos cuadros salen del mismo archivo y de las mismas fuentes, y difieren en $140.350.438 en el
// único número que decide si el año cierra con más o con menos plata. Con signo opuesto: uno dice
// que la empresa quema caja y el otro que la genera.
//
// LA CAUSA. El cash flow mensual proyecta los egresos de los meses que todavía no pasaron
// (formulaMesConProyeccion: la pestaña de detalle si la tiene, o el ritmo de los últimos meses). El
// semanal usa formulaRubroEnVentana, que suma ÚNICAMENTE las filas reales que caen en la ventana de
// esa semana — sin rama de proyección. Así que de septiembre en adelante el semanal muestra $0 de
// Proveedores y $0 de Estructura, contra $30M y $4,6M por mes del mensual. Medido sobre el año:
// Proveedores −$120.505.244 · Estructura −$18.726.419 · Deuda financiera −$1.586.549.
//
// Es exactamente el defecto que cash-flow-lineas.mjs documenta haber corregido en el mensual el
// 20/07 ("el cash flow proyectaba los INGRESOS pero no los egresos … el último cuatrimestre daba un
// superávit que no existe"). Nunca se aplicó al semanal, y el semanal es el cuadro que se mira para
// decidir un pago esta semana.
//
// POR QUÉ SE COMPARA EL AÑO Y NO EL MES. Una semana cruza el fin de mes (30/03→05/04) y sus
// movimientos caen a los dos lados. Repartir esa semana entre dos meses es una convención, y
// cualquiera que se elija genera diferencias de borde que no son defectos. El total del año no tiene
// ese problema: los bordes se cancelan y lo que queda es diferencia de verdad. Por eso el invariante
// que se audita es anual, y el corte mensual se informa como indicio, nunca como hallazgo.

/** Un importe del Sheet en es_AR ("-$1.234,50", "—", "") a número. PURA. */
export function importe(s) {
  const t = String(s ?? '').trim()
  if (!t || t === '—' || t === '-') return 0
  const negativo = t.startsWith('-') || t.startsWith('(')
  const n = Number(t.replace(/[^0-9,.]/g, '').replace(/\./g, '').replace(',', '.')) || 0
  return negativo ? -n : n
}

/**
 * De qué mes del año es cada columna del cuadro semanal, mirando la fila de encabezados ("dd/mm").
 *
 * LA PRIMERA SEMANA PUEDE SER DEL AÑO ANTERIOR. El cuadro arranca en el lunes 29/12, que es de 2025:
 * si se lo cuenta como diciembre, sus movimientos se suman al total del año y el cuadre se rompe por
 * una razón que no existe. Se descarta.
 * @returns {Array<number|null>} índice = columna (0 = A), valor = mes 1..12 o null
 */
export function mesesDeColumnas(filaEncabezado = []) {
  const meses = filaEncabezado.map((v, i) => {
    if (i === 0) return null
    const m = /^(\d{1,2})\/(\d{1,2})$/.exec(String(v ?? '').trim())
    return m ? Number(m[2]) : null
  })
  const primera = meses.findIndex((m) => m !== null)
  if (primera >= 0 && meses[primera] === 12) meses[primera] = null
  return meses
}

/**
 * NÚCLEO PURO: el cuadre anual de una fila entre los dos cuadros.
 * @param {Array} filaSemanal la fila del cash flow semanal (columna A + semanas)
 * @param {Array} filaMensual la fila del cash flow mensual (A + B..M meses + N total)
 * @param {Array<number|null>} meses salida de mesesDeColumnas
 */
export function cuadrarFila(filaSemanal = [], filaMensual = [], meses = []) {
  let semanal = 0
  for (let c = 1; c < meses.length; c++) if (meses[c]) semanal += importe(filaSemanal[c])
  let mensual = 0
  for (let m = 1; m <= 12; m++) mensual += importe(filaMensual[m])
  return { semanal, mensual, diferencia: semanal - mensual }
}

/**
 * TOLERANCIA: un peso por mes. No es cero porque los dos cuadros redondean por separado y una
 * diferencia de centavos por celda es ruido, no un hallazgo. Doce pesos en un cuadro de cientos de
 * millones no esconde nada; $120 millones sí, y eso es lo que esto tiene que gritar.
 */
export const TOLERANCIA = 12

/**
 * NÚCLEO PURO: las filas donde los dos cuadros no cuentan lo mismo.
 * @param {Array<{fila:number, nombre:string}>} lineas qué filas comparar
 */
export function hallazgos(lineas = [], semanal = [], mensual = [], meses = []) {
  return lineas
    .map((l) => ({ ...l, ...cuadrarFila(semanal[l.fila - 1] || [], mensual[l.fila - 1] || [], meses) }))
    .filter((r) => Math.abs(r.diferencia) > TOLERANCIA)
}
