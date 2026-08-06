// LA PIEL DE "CARGAS SOCIALES" — la piel de statement compartida más lo propio de la grilla mensual.
//
// Lo propio de esta pestaña son cuatro cosas: la grilla mensual en moneda, las filas que NO son plata
// (personas, proporciones, fechas), la columna de procedencia angosta, y CERO notas.

import { skinRequests } from './estilo-statement.mjs'
import { borrarNotas } from './nota-celda.mjs'
import { ANCHO } from './cargas-grilla.mjs'

/** El formato: la piel de statement compartida más lo propio de la grilla mensual. */
export async function formatear(google, fileId, sheetId, filas, { cantidades = [], ratios = [], fechas = [], titular = 0, prosaFormula = [] } = {}) {
  // ═══ NINGUNA NOTA. NI UNA. ═══
  //
  // POR QUÉ (23/07, TERCERA VEZ SOBRE LO MISMO). El dueño: "la pestaña cargas sociales vuelve a
  // tener los comentarios de mierda esos en el medio" — y antes, sobre Impuestos: "quitá las notas,
  // son confusas". Él las había BORRADO a mano; este generador se las volvió a escribir en la
  // corrida siguiente, porque `origenANota` reescribe la nota de cada fila en cada pasada.
  //
  // Es la regla 0 aplicada a las NOTAS: si el dueño borró algo, borrado queda. Y la única forma de
  // garantizarlo es no volver a escribirlas nunca — un generador que reescribe la nota en cada
  // corrida siempre le va a ganar a la persona que la borró una vez.
  //
  // La trazabilidad no se pierde: vive en el subtítulo de la pestaña y en el título de cada sección,
  // una sola vez, como las notas al pie de un tearsheet.
  const { requests: notas, borradas } = borrarNotas(filas, ANCHO - 1, sheetId)
  if (borradas) console.log(`notas: barro las ${borradas} filas — la procedencia va en el subtítulo, no en un triangulito por fila`)
  const rg = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const moneda = { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }
  const reqs = [
    ...notas,
    ...skinRequests({ sheetId, filas, cols: ANCHO, congeladas: 2, titular }),
    // Los doce meses más el total: moneda, a la derecha, con cifras tabulares. Es lo que permite
    // comparar hacia abajo sin leer cada número.
    { repeatCell: { range: rg(3, filas.length, 1, 14), cell: { userEnteredFormat: { numberFormat: moneda, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } },
    // La columna de origen: chica, apagada, y que envuelva. Es explicación, no dato.

    // Las filas vuelven a su altura: al sacar el muro de texto de la derecha quedaron con el alto
    // que ESE texto necesitaba, y la pestaña medía tres pantallas de aire.
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: filas.length }, properties: { pixelSize: 21 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 330 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 13 }, properties: { pixelSize: 108 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 13, endIndex: 14 }, properties: { pixelSize: 124 }, fields: 'pixelSize' } },
    // La columna de procedencia (O): angosta a propósito. El texto de origen se escribe en la celda
    // —no en una nota, que el dueño hizo sacar— y al ser la ÚLTIMA columna desborda a la derecha como
    // la nota al pie de un tearsheet: se lee al posar el ojo, sin abrir un hueco entre los cuadros.
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 14, endIndex: 15 }, properties: { pixelSize: 24 }, fields: 'pixelSize' } },
  ]
  // Los encabezados de mes: rótulos de columna, no importes — sin formato de moneda encima.
  filas.forEach((f, i) => {
    if (String(f?.[0]) !== 'Concepto') return
    reqs.push({ repeatCell: { range: rg(i, i + 1, 1, 14), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } })
  })
  // Las filas que no son plata, con el formato de lo que son.
  for (const f of cantidades) {
    reqs.push({ repeatCell: { range: rg(f - 1, f, 1, 14), cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0;;"—"' } } }, fields: 'userEnteredFormat.numberFormat' } })
  }
  for (const f of ratios) {
    reqs.push({ repeatCell: { range: rg(f - 1, f, 1, 14), cell: { userEnteredFormat: { numberFormat: { type: 'PERCENT', pattern: '0.0%;;"—"' } } }, fields: 'userEnteredFormat.numberFormat' } })
  }
  // Las fechas son fechas: el serial con formato de moneda se dibuja "$46.244" y ya rompió tres
  // cuadros de este libro. Van con el año, porque la última de la fila cae en enero del año siguiente.
  for (const f of fechas) {
    reqs.push({ repeatCell: { range: rg(f - 1, f, 1, 14), cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' } } }, fields: 'userEnteredFormat.numberFormat' } })
  }
  reqs.push(...prosaFormula.map(({ fila, col }) => ({
    repeatCell: {
      range: { sheetId, startRowIndex: fila - 1, endRowIndex: fila, startColumnIndex: col, endColumnIndex: col + 1 },
      cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT' } },
      fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
    },
  })))
  await google.spreadsheetBatchUpdate(fileId, reqs)
}
