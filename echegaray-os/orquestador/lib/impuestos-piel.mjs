// LA PIEL DE "IMPUESTOS Y FINANCIEROS" — la misma que CAJA, Cheques y Cargas Sociales.
//
// Sin reja, secciones y encabezados por tipografía + hairline (no barras rellenas), totales rulados,
// moneda sin decimales, aire. Lo propio de esta pestaña son tres cosas: la grilla mensual, las filas
// que NO son plata (alícuotas, fechas de DDJJ) y los meses PROYECTADOS en ámbar.

import { skinRequests } from './estilo-statement.mjs'
import { borrarNotas } from './nota-celda.mjs'
import { requestsTextoPorContenido } from './formato-texto-por-contenido.mjs'
import { ANCHO } from './impuestos-grilla.mjs'

const AMBAR = { red: 1, green: 0.97, blue: 0.88 }

/**
 * @param {object} g la grilla armada: {filas, titular, alicuotas, textos, ambar, congeladas}
 * @param {number} filasHoja cuántas filas tiene hoy la pestaña
 */
export async function formatear(google, fileId, sheetId, g, filasHoja = 0) {
  // SIN NOTAS. El dueño: "quitá las notas de impuestos y financieros, son confusas". Veintiocho
  // triangulitos amarillos son veintiocho invitaciones a interrumpir la lectura. La trazabilidad no
  // se pierde: cada sección declara su fuente en su título, y lo que hace falta ver —una fecha
  // supuesta, un mes proyectado— viaja en el rótulo o en el color, no escondido detrás de un hover.
  const { requests: notas } = borrarNotas(g.filas, ANCHO - 1, sheetId)
  const n = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [{ unmergeCells: { range: r(0, n) } }]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })

  // Los doce meses más el total: moneda sin decimales, a la derecha. Es lo que permite comparar hacia
  // abajo sin volver a leer el encabezado en cada bloque. El cero se dibuja "—": un guión es "no hay
  // nada que pagar ese día", y un $0 se lee como un importe que alguien calculó.
  fmt(r(3, n, 1, 14), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' })
  // La columna A rebalsa sobre las celdas vacías de su derecha: así un título de sección no se parte.
  fmt(r(0, n, 0, 1), 'userEnteredFormat.wrapStrategy', { wrapStrategy: 'OVERFLOW_CELL' })

  g.filas.forEach((f, i) => {
    const a = String(f?.[0] ?? '')
    // Los encabezados son rótulos, no importes: sin formato de moneda encima.
    if (/^(Concepto|Fecha y concepto|Línea de financiamiento|LA POSICIÓN)/.test(a)) {
      fmt(r(i, i + 1, 1, 14), 'userEnteredFormat(numberFormat,horizontalAlignment)', { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'RIGHT' })
    }
    if (/^⚠/.test(a)) fmt(r(i, i + 1, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, foregroundColor: { red: 0.7, green: 0.2, blue: 0.1 } } })
  })
  for (const f of g.alicuotas ?? []) fmt(r(f - 1, f, 1, 14), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'PERCENT', pattern: '0.00%;;"—"' } })
  for (const f of g.textos ?? []) fmt(r(f - 1, f, 1, 14), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment', { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'RIGHT' })

  // ═══ EL ÁMBAR VA POR CELDA, NO POR COLUMNA (06/08) ═══
  //
  // Antes pintaba la columna del mes entera de la fila 4 para abajo. Con la posición y el calendario
  // ARRIBA del detalle, la columna B ya no es "enero": es el importe del hero y el del calendario.
  // Pintar la columna habría teñido de proyección la posición de HOY, que es exactamente lo contrario
  // de lo que el color dice. Una proyección que se ve igual que un hecho termina leyéndose como un
  // hecho; un hecho pintado de proyección también miente, y en el sentido que más caro sale.
  for (const { fila, mes } of g.ambar ?? []) {
    fmt(r(fila - 1, fila, mes, mes + 1), 'userEnteredFormat.backgroundColor', { backgroundColor: AMBAR })
  }

  // Al sacar el muro de texto de la derecha, las filas quedaban con el alto que ese texto necesitaba
  // para envolver: la pestaña medía tres pantallas de aire.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: n }, properties: { pixelSize: 21 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 360 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 13 }, properties: { pixelSize: 108 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 13, endIndex: 14 }, properties: { pixelSize: 124 }, fields: 'pixelSize' } })
  // La columna de procedencia ya no muestra texto (se vacía): angosta.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 14, endIndex: 15 }, properties: { pixelSize: 24 }, fields: 'pixelSize' } })
  req.push(...notas)

  // ═══ DOS GUARDAS ANTES DE FORMATEAR ═══
  //
  // 1. LA GRILLA TIENE QUE ENTRAR EL BLOQUE. La pestaña tenía 69 filas, el bloque creció, el formateo
  //    pidió `A70:O69` y Google rechazó el lote ENTERO con 400. Lo grave no fue el error: los VALORES
  //    ya se habían escrito, así que quedaron las fórmulas nuevas sin el rango con nombre que publican
  //    las líneas de abajo —que nunca se ejecutaron— y la pestaña mostró `#NAME?` en toda la
  //    proyección. Una escritura a medias es peor que ninguna.
  // 2. UN RANGO VACÍO NO SE MANDA. Un `startRowIndex >= endRowIndex` cuesta el lote completo. Se
  //    descarta acá, una vez, en vez de esperar que cada `fmt` de arriba se acuerde.
  let alto = filasHoja ?? 0
  if (n > alto) {
    await google.spreadsheetBatchUpdate(fileId, [{ appendDimension: { sheetId, dimension: 'ROWS', length: n + 5 - alto } }])
    console.log(`  la grilla pasa de ${alto} a ${n + 5} filas: el bloque no entraba`)
    alto = n + 5
  }
  const vacio = (q) => {
    const g0 = q?.repeatCell?.range ?? q?.updateCells?.range ?? q?.unmergeCells?.range
    return g0 && Number(g0.startRowIndex ?? 0) >= Number(g0.endRowIndex ?? 0)
  }
  const descartados = req.filter(vacio).length
  if (descartados) console.log(`  ⚠ ${descartados} pedido(s) de formato con rango vacío, descartados`)
  await google.spreadsheetBatchUpdate(fileId, req.filter((q) => !vacio(q)))
  // CONGELADAS HASTA EL HERO: al desplazarse por el detalle, la posición sigue arriba. Es lo que
  // pidió el dueño ("la pantalla muestra PRIMERO la posición") y no sirve de nada si se va al scrollear.
  await google.spreadsheetBatchUpdate(fileId, skinRequests({
    sheetId, filas: g.filas, cols: ANCHO, congeladas: g.congeladas ?? 2, titular: g.titular, filasHoja: alto,
  }))

  // ═══ UN TEXTO SE DIBUJA COMO TEXTO, DECIDIDO POR CONTENIDO ═══
  // Una celda que dice "s/d" con formato de plata se lee como si hubiera un importe que no se ve. No
  // se arregla con una lista de rangos que hay que mantener: se decide por CONTENIDO. Va DESPUÉS de
  // la piel, o la piel se lo lleva puesto: los `repeatCell` se aplican en orden.
  const { requests: rTxt, celdas } = requestsTextoPorContenido(sheetId, g.filas || [])
  if (rTxt.length) await google.spreadsheetBatchUpdate(fileId, rTxt)
  if (celdas) console.log(`  ${celdas} celda(s) de TEXTO con su formato de texto (no de plata)`)
  // Ninguna fila queda OCULTA: un colapso de una versión anterior dejó filas con hiddenByUser=true,
  // y borrar el grupo no las vuelve a mostrar.
  await google.spreadsheetBatchUpdate(fileId, [{ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: n + 5 }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } }]).catch(() => {})
}
