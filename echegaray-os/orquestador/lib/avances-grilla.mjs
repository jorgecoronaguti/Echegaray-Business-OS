// LA GRILLA DIARIA DE «AVANCES DE OBRA» — el registro de ejecución que la empresa ya lleva.
//
// ═══ LO QUE SE DESCUBRIÓ AL LEER EL ARCHIVO ENTERO ═══
//
// «Avances de Obra» NO tiene columnas de unidad ni de cantidad. Sus encabezados reales son
// `# · Activity · Comment · Start · End · Days · Status · Días Reales · % Done`. Lo que sí tiene, a
// la derecha de todo eso, es UNA COLUMNA POR DÍA con el avance de ESE día en la celda:
//
//     MONTAJE DE SOPORTES        16/07: 0%     22/07: 70%     23/07: 30%
//
// Eso es un parte diario incremental, y es la parte del Excel que hay que conservar: dice CUÁNDO
// avanzó cada actividad, no sólo cuánto lleva. `% Done` es el acumulado y se puede reconstruir; la
// grilla no se puede reconstruir desde `% Done`.
//
// ═══ POR QUÉ ESTE MÓDULO NO TOCA GOOGLE ═══
//
// Decidir qué columna es un día y qué celda es un avance es lo único que puede estar mal de forma
// cara: una columna mal identificada convierte «Días Reales: 3» en «3% el 4 de enero de 1900». Se
// prueba con filas reales, sin red.

import { parsePct, serialAIso } from './obra-cronograma.mjs'

/**
 * Dónde empieza el calendario en la fila de encabezado.
 *
 * Las columnas de la izquierda son texto («Activity», «Status») y las del calendario son FECHAS. Se
 * busca la primera fecha válida DESPUÉS de la última columna conocida del bloque de la izquierda —no
 * la primera de toda la fila— porque `Start` y `End` también tienen encabezado de texto pero la fila
 * 2 de algunas pestañas trae la fecha de inicio del proyecto y confundiría el corte.
 */
export function inicioDelCalendario(encabezado = [], desde = 0) {
  for (let i = desde; i < encabezado.length; i++) {
    if (serialAIso(encabezado[i])) return i
  }
  return -1
}

/** Las fechas del calendario, por columna. `null` en las columnas que no son un día. */
export function fechasDelCalendario(encabezado = [], desde = 0) {
  const inicio = inicioDelCalendario(encabezado, desde)
  if (inicio < 0) return []
  return encabezado.map((c, i) => (i >= inicio ? serialAIso(c) : null))
}

/**
 * Los partes diarios de UNA fila de actividad.
 *
 * Devuelve `[{ fecha, pct }]` sólo de las celdas con un valor. Una celda vacía NO es un cero: es un
 * día en el que nadie cargó nada, y meterlo como 0% llenaría la base de partes que no existieron.
 *
 * El 0% SÍ entra cuando está escrito: en el archivo real hay actividades con «0.00%» cargado a
 * propósito el día que se esperaba avanzar y no se avanzó. Eso es información.
 */
export function partesDeLaFila(fila = [], fechas = []) {
  const partes = []
  for (let i = 0; i < fechas.length; i++) {
    if (!fechas[i]) continue
    const celda = fila[i]
    if (celda === undefined || celda === null || String(celda).trim() === '') continue
    const pct = parsePct(celda)
    if (pct === null) continue
    partes.push({ fecha: fechas[i], pct })
  }
  return partes
}

/**
 * ¿Los partes de esta fila son coherentes con el acumulado que declara `% Done`?
 *
 * No es una validación caprichosa: si la grilla suma 100% y `% Done` dice 40%, uno de los dos está
 * mal y migrar el que no corresponde publica un avance falso. Se declara la diferencia y decide una
 * persona; nada se corrige solo.
 */
export function coherencia(partes, pctDeclarado) {
  const suma = partes.reduce((s, p) => s + p.pct, 0)
  if (pctDeclarado === null || pctDeclarado === undefined) return { suma, diferencia: null }
  return { suma, diferencia: Math.round((suma - pctDeclarado) * 10) / 10 }
}
