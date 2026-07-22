// FORMATO CONDICIONAL — QUE EL ERROR SE VEA.
//
// POR QUÉ (22/07). El checklist de clase mundial (skill google-sheets-business-systems) pide "formato
// condicional para que el error se vea": un #ERROR!, #REF! o #N/A que aparece en una celda de fórmula
// hoy sólo lo encuentra el auditor de pantalla cuando corre, o el dueño si justo abre esa celda. Una
// regla condicional que pinta en rojo cualquier celda con error hace que un modelo roto GRITE en la
// pantalla, en el momento, sin esperar a nadie.
//
// ES LA VERSIÓN VISUAL DE LA REGLA DE ORO 11 (cada regla, medible): el auditor la mide desde afuera;
// esto la muestra desde adentro de la planilla.
//
// POR QUÉ SE BORRAN LAS REGLAS ANTES DE AGREGAR. addConditionalFormatRule APILA: sin borrar las que
// ya hay, cada corrida del agente (cada 2 h) dejaría una copia más de la misma regla. Las pestañas
// calculadas son del OS, así que el OS es dueño de su formato condicional: las reemplaza enteras.

/** Rojo tenue de fondo y rojo fuerte de texto: se lee "algo está mal acá" sin tapar el valor. */
export const ROJO_ERROR = { red: 0.96, green: 0.80, blue: 0.80 }
export const TEXTO_ERROR = { red: 0.6, green: 0, blue: 0 }

/**
 * NÚCLEO PURO: la regla que pinta en rojo toda celda con error de fórmula.
 *
 * El CUSTOM_FORMULA `=ISERROR(A1)` se evalúa por celda con A1 anclado a la primera celda del rango
 * (fila 0, columna 0 = A1), así que cada celda se chequea a sí misma. Un solo argumento: no hay coma
 * que chocar con el locale es-AR.
 *
 * @param {number} sheetId
 * @param {number} cols cuántas columnas cubre (0..cols)
 * @param {number} hastaFila hasta qué fila (0..hastaFila)
 * @param {number} index posición de la regla en la pestaña
 */
export function reglaError(sheetId, cols, hastaFila, index = 0) {
  return {
    addConditionalFormatRule: {
      index,
      rule: {
        ranges: [{ sheetId, startRowIndex: 0, endRowIndex: hastaFila, startColumnIndex: 0, endColumnIndex: cols }],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=ISERROR(A1)' }] },
          format: { backgroundColor: ROJO_ERROR, textFormat: { foregroundColor: TEXTO_ERROR, bold: true } },
        },
      },
    },
  }
}

/**
 * NÚCLEO PURO: borrar todas las reglas que ya tiene una pestaña.
 * deleteConditionalFormatRule borra por índice y REINDEXA hacia abajo, así que borrar el índice 0
 * tantas veces como reglas haya las saca todas.
 */
export function borrarReglas(sheetId, cantidad = 0) {
  return Array.from({ length: Math.max(0, cantidad) }, () => ({ deleteConditionalFormatRule: { sheetId, index: 0 } }))
}

/**
 * NÚCLEO PURO: los requests para dejar UNA pestaña con exactamente una regla de error, sin importar
 * cuántas tenía antes. Borra primero (reindexa), agrega después.
 */
export function requestsPara(sheetId, { cols, hastaFila, reglasExistentes = 0 } = {}) {
  return [...borrarReglas(sheetId, reglasExistentes), reglaError(sheetId, cols, hastaFila)]
}
