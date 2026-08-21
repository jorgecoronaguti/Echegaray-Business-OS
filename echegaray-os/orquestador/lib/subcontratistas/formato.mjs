// EL FORMATO DE LA PESTAÑA, EN PEDIDOS DE LA API DE SHEETS.
//
// Vive separado del contenido porque son dos preguntas distintas: `pestana.mjs` decide QUÉ dice
// cada celda; esto decide CÓMO se ve. Las dos reglas del dueño se aplican acá:
//
//  · MINIMALISMO — se apaga la cuadrícula de toda la hoja, no hay rellenos de color, no hay bordes
//    de caja. La única línea del cuadro es la de arriba del TOTAL, que es la convención contable.
//  · CLASE MUNDIAL — el código de color de los modelos de banca: AZUL lo tipeado, NEGRO lo que se
//    calcula en la misma hoja, VERDE lo que viene de otra. Negativos entre paréntesis.
//
// Los patrones de `numberFormat` van SIEMPRE en formato US (`#,##0`) aunque el archivo sea es_AR:
// la API no habla locale. El separador de las FÓRMULAS sí es `;`, y eso se decide en pestana.mjs.
export const AZUL = { red: 0, green: 0, blue: 0.8 }        // dato tipeado
export const VERDE = { red: 0, green: 0.38, blue: 0.05 }   // viene de otra hoja
export const GRIS = { red: 0.45, green: 0.45, blue: 0.45 }
export const TINTA = { red: 0.12, green: 0.12, blue: 0.12 }

export const MONEDA = '"$" #,##0;("$" #,##0)'  // negativos entre paréntesis, como en un modelo
export const FECHA = 'dd/mm/yyyy'
export const PORCENTAJE = '0.0%'

const col = (s) => [...s].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1
/** Convierte «C10:F24» en el `GridRange` que espera la API. */
export function rango(sheetId, a1) {
  const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(a1)
  if (!m) throw new Error(`rango inválido: ${a1}`)
  const [, c0, f0, c1 = m[1], f1 = m[2]] = m
  return { sheetId, startRowIndex: +f0 - 1, endRowIndex: +f1, startColumnIndex: col(c0), endColumnIndex: col(c1) + 1 }
}

const celda = (sheetId, a1, userEnteredFormat, fields) => ({
  repeatCell: { range: rango(sheetId, a1), cell: { userEnteredFormat }, fields },
})
const texto = (sheetId, a1, textFormat) => celda(sheetId, a1, { textFormat }, 'userEnteredFormat.textFormat')
const numero = (sheetId, a1, pattern, type) => celda(sheetId, a1, { numberFormat: { type, pattern } }, 'userEnteredFormat.numberFormat')

/** @param d el resultado de `construir()` · @param ancho columnas que ocupa el cuadro */
export function pedidos(sheetId, d, ancho) {
  const p = []

  // ── MINIMALISMO: la hoja sin cuadrícula. Es el trazo que más «tinta sin dato» aporta.
  p.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true, frozenRowCount: 2 } }, fields: 'gridProperties.hideGridlines,gridProperties.frozenRowCount' } })

  // Una sola tipografía en toda la hoja, y la tinta un punto por debajo del negro puro.
  p.push(celda(sheetId, `A1:${String.fromCharCode(64 + ancho)}${d.pie.hasta + 2}`,
    { textFormat: { fontFamily: 'Inter', fontSize: 10, foregroundColor: TINTA } }, 'userEnteredFormat.textFormat'))

  p.push(texto(sheetId, 'A1', { fontFamily: 'Inter', fontSize: 18, bold: true, foregroundColor: TINTA }))
  p.push(texto(sheetId, `A2:${String.fromCharCode(64 + ancho)}2`, { fontFamily: 'Inter', fontSize: 9, foregroundColor: GRIS }))

  // ── EL TITULAR: tres cifras grandes y su rótulo chico debajo. Nada más arriba del cuadro.
  p.push(texto(sheetId, `A${d.fKpi}:C${d.fKpi}`, { fontFamily: 'Inter', fontSize: 20, bold: true, foregroundColor: TINTA }))
  p.push(numero(sheetId, `B${d.fKpi}`, MONEDA, 'CURRENCY'))
  p.push(numero(sheetId, `C${d.fKpi}`, PORCENTAJE, 'PERCENT'))
  p.push(texto(sheetId, `A${d.fKpi + 1}:C${d.fKpi + 1}`, { fontFamily: 'Inter', fontSize: 9, foregroundColor: GRIS }))

  for (const f of d.secciones) {
    p.push(texto(sheetId, `A${f}:${String.fromCharCode(64 + ancho)}${f}`, { fontFamily: 'Inter', fontSize: 9, bold: true, foregroundColor: GRIS }))
  }
  for (const f of d.encabezados) {
    p.push(texto(sheetId, `A${f}:${String.fromCharCode(64 + ancho)}${f}`, { fontFamily: 'Inter', fontSize: 9, bold: true, foregroundColor: GRIS }))
    p.push(celda(sheetId, `C${f}:${String.fromCharCode(64 + ancho)}${f}`, { horizontalAlignment: 'RIGHT' }, 'userEnteredFormat.horizontalAlignment'))
  }

  // ── EL CÓDIGO DE COLOR DE BANCA. Es lo único que colorea la hoja, y dice algo.
  for (const r of d.azul) p.push(texto(sheetId, r, { fontFamily: 'Inter', fontSize: 10, foregroundColor: AZUL }))
  for (const r of d.verde) p.push(texto(sheetId, r, { fontFamily: 'Inter', fontSize: 10, foregroundColor: VERDE }))
  for (const r of d.fechas) p.push(numero(sheetId, r, FECHA, 'DATE'))
  for (const r of d.monedas) p.push(numero(sheetId, r, MONEDA, 'CURRENCY'))

  // ── LA ÚNICA LÍNEA DEL CUADRO: arriba del total, como en cualquier modelo.
  for (const f of d.totales) {
    p.push({
      repeatCell: {
        range: rango(sheetId, `A${f}:${String.fromCharCode(64 + ancho)}${f}`),
        cell: { userEnteredFormat: { textFormat: { fontFamily: 'Inter', fontSize: 10, bold: true, foregroundColor: TINTA }, borders: { top: { style: 'SOLID', color: TINTA } } } },
        fields: 'userEnteredFormat.textFormat,userEnteredFormat.borders',
      },
    })
    p.push(numero(sheetId, `E${f}:F${f}`, MONEDA, 'CURRENCY'))
  }

  p.push(texto(sheetId, `A${d.pie.desde}:A${d.pie.hasta}`, { fontFamily: 'Inter', fontSize: 8, foregroundColor: GRIS }))

  // Anchos fijos: `autoResize` hace bailar las columnas en cada corrida y el cuadro nunca se ve igual.
  const anchos = [230, 330, 78, 78, 118, 128]
  anchos.slice(0, ancho).forEach((px, i) => p.push({
    updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' },
  }))
  return p
}
