// LA PIEL DE "CARGAS SOCIALES" — la piel de statement compartida más lo propio de la grilla mensual.
//
// Lo propio de esta pestaña son cuatro cosas: la grilla mensual en moneda, las filas que NO son plata
// (personas, proporciones, fechas), la columna de procedencia angosta, y CERO notas.

import { skinRequests, MUTED } from './estilo-statement.mjs'
import { borrarNotas } from './nota-celda.mjs'
import { ANCHO } from './cargas-grilla.mjs'

/** El formato: la piel de statement compartida más lo propio de la grilla mensual. */
export async function formatear(google, fileId, sheetId, filas, {
  cantidades = [], ratios = [], fechas = [], titular = 0, prosaFormula = [], pies = [], controles = [],
} = {}) {
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
    // ═══ EL TÍTULO QUE SE CORTABA NO ERA LARGO: LA CELDA ESTABA EN "AJUSTAR" (06/08) ═══
    //
    // En el PDF de la pestaña, el título de la sección 3 salía partido en dos renglones y el segundo
    // ("AL DÍA?") pisaba el encabezado de la tabla de abajo. Los otros seis títulos, algunos MÁS
    // LARGOS, salían enteros. La diferencia no era el texto: esa celda tenía `wrapStrategy: WRAP` de
    // alguna versión anterior de la pestaña, y con las filas fijadas en 21 píxeles la segunda línea
    // se derrama sobre la fila siguiente. NINGÚN generador era dueño de esa propiedad, así que se
    // heredaba para siempre — el mismo modo de falla que las notas que resucitaban.
    //
    // Ahora la piel la declara, que es lo que la vuelve reproducible:
    //   · columna A: DERRAMA a la derecha. Es lo que hace que un título o una nota al pie se lean
    //     enteros sin abrir un hueco entre los cuadros — el criterio que el repo ya usa para los ⚠.
    //   · columnas B..N: CORTA. Un importe nunca debe partirse en dos renglones; si no entra, que se
    //     vea que no entra en vez de descuadrar la fila entera.
    { repeatCell: { range: rg(0, filas.length, 0, 1), cell: { userEnteredFormat: { wrapStrategy: 'OVERFLOW_CELL' } }, fields: 'userEnteredFormat.wrapStrategy' } },
    { repeatCell: { range: rg(0, filas.length, 1, ANCHO), cell: { userEnteredFormat: { wrapStrategy: 'CLIP' } }, fields: 'userEnteredFormat.wrapStrategy' } },
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
  // ═══ UNA NOTA AL PIE SE TIENE QUE VER COMO UNA NOTA AL PIE ═══
  //
  // Las cuatro advertencias de la pestaña salían con la misma tinta y el mismo cuerpo que los
  // importes, y tres de ellas con negrita y regla encima porque empiezan con "⚠" y la piel compartida
  // lee eso como un total. Cuatro renglones de letra al mismo peso que las cifras es exactamente lo
  // que le gana el ojo a los números. Van apagadas y a 9 puntos, sin regla: se leen cuando se las
  // busca y no antes. Va DESPUÉS de `skinRequests` a propósito — el último request gana.
  reqs.push(...pies.flatMap((f) => [
    { repeatCell: { range: rg(f - 1, f, 0, ANCHO), cell: { userEnteredFormat: { textFormat: { foregroundColor: MUTED, bold: false, italic: false, fontSize: 9, fontFamily: 'Arial' } } }, fields: 'userEnteredFormat.textFormat' } },
    { updateBorders: { range: rg(f - 1, f, 0, ANCHO), top: { style: 'NONE' } } },
  ]))
  // ═══ EL CONTROL DICE SU RESPUESTA, NO UN GUION ═══
  //
  // El barrido de moneda dibuja el cero como "—", que en una fila de importes es correcto: un mes sin
  // movimiento no debe gritar "$0". Pero en "⇒ Diferencia — tiene que ser $0" el cero ES la respuesta,
  // y salía igual que una celda sin dato. La tercera sección del patrón —la del cero— pasa a decirlo.
  for (const f of controles) {
    reqs.push({ repeatCell: { range: rg(f - 1, f, 1, 2), cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '[Red]"$"#,##0;[Red]-"$"#,##0;"✓ $0"' } } }, fields: 'userEnteredFormat.numberFormat' } })
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
