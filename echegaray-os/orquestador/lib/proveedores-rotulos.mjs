// LA FILA DE RÓTULOS DE UNA TABLA DINÁMICA: SU FORMATO ES PROPIO, NO EL DEL CUERPO.
//
// ═══ EL DEFECTO QUE ESTO ARREGLA (05/08) ═══
//
// Medido con `auditar-pantalla.mjs` sobre "Proveedores": B17 "Se le debe", C17 "Facturas",
// G32 "Importe", C69 "Comprado 2026", D69 "Comprobantes" — cinco `texto_en_numero`. No es que el
// rótulo esté mal escrito: es que la banda de formato del CUERPO arrancaba en la fila del rótulo,
// así que la celda que dice "Comprado 2026" quedaba declarada CURRENCY y la que dice "Comprobantes",
// contador. Un texto en una celda de número es exactamente lo que el auditor persigue, y acá lo
// producía el propio generador en cada corrida.
//
// Y el mismo arranque tapaba el otro defecto: C32 "Fecha prevista de pago (día)" cortado. Ese rótulo
// NO se puede acortar —lo hereda del encabezado de Compras, que es fuente y no se edita (la API de
// pivots sólo deja renombrar los `values`, nunca los campos de fila)—. Si el rótulo no se puede
// acortar y la columna no se puede ensanchar sin empujar la pestaña entera, queda la tercera salida:
// que el rótulo se PARTA EN DOS LÍNEAS y la fila tenga alto para las dos.
//
// ═══ EL ALTO SE CALCULA CON LA MISMA CUENTA QUE MIDE EL AUDITOR ═══
//
// `lib/defectos-pantalla.mjs` decide que un texto con WRAP está cortado cuando
// `alto < ceil(len*fontSize*0.57 / anchoCol) * (fontSize+5)`. Poner un alto "generoso" a ojo no
// sirve: o sobra tinta o el defecto vuelve con el primer rótulo largo. Se usa la MISMA fórmula, y el
// test la verifica corriendo el detector de verdad sobre lo que este módulo emite — si el umbral del
// auditor cambia, el test se pone rojo acá.

/** Los rótulos van un punto más chicos que el cuerpo, igual que en el encabezado de la pestaña. */
export const FONT_ROTULO = 9

/** El alto por defecto de una fila en Sheets. Ningún rótulo baja de acá. */
export const ALTO_MINIMO = 21

/** El ancho en píxeles que ocupa un texto. Misma constante que usa el auditor de pantalla. */
export function anchoDelTexto(texto, fontSize = FONT_ROTULO) {
  return String(texto ?? '').length * fontSize * 0.57
}

/**
 * Cuántas líneas ocupa un rótulo dentro de su columna. Con `anchoPx` en 0 o menos no hay nada que
 * calcular: se devuelve 1, porque una columna sin ancho conocido no puede exigir un alto.
 */
export function lineasQueOcupa(texto, anchoPx, fontSize = FONT_ROTULO) {
  if (!(anchoPx > 0)) return 1
  return Math.max(1, Math.ceil(anchoDelTexto(texto, fontSize) / anchoPx))
}

/**
 * EL ALTO QUE NECESITA LA FILA para que NINGUNO de sus rótulos quede cortado.
 *
 * @param {string[]} textos  un rótulo por columna, en orden
 * @param {number[]} anchos  el ancho en px de cada columna (ANCHOS_PROVEEDORES)
 * @param {number} [fontSize]
 * @returns {number} píxeles
 */
export function altoDeRotulos(textos = [], anchos = [], fontSize = FONT_ROTULO) {
  const lineas = textos.reduce((mx, t, i) => Math.max(mx, lineasQueOcupa(t, anchos[i], fontSize)), 1)
  return Math.max(ALTO_MINIMO, lineas * (fontSize + 5))
}

/**
 * ¿QUÉ RÓTULO NO ENTRA NI PARTIDO EN DOS?
 *
 * Un rótulo que necesita tres líneas no está pidiendo una fila más alta: está diciendo que el texto
 * es demasiado largo para su columna y hay que acortarlo. La regla de la pestaña es acortar el
 * rótulo antes que ensanchar la columna —ensanchar la A por una frase empuja todo lo demás—, así que
 * esto existe para que el generador lo GRITE en vez de dejar una fila de 45px.
 *
 * @returns {Array<{col:number, texto:string, lineas:number}>} vacío = está bien
 */
export function rotulosQueNoEntran(textos = [], anchos = [], { maxLineas = 2, fontSize = FONT_ROTULO } = {}) {
  return textos
    .map((texto, col) => ({ col, texto, lineas: lineasQueOcupa(texto, anchos[col], fontSize) }))
    .filter((r) => r.lineas > maxLineas)
}

/**
 * LOS REQUESTS QUE LE DAN A LA FILA DE RÓTULOS SU FORMATO PROPIO.
 *
 * TEXTO (nunca el formato numérico del cuerpo), WRAP, el alto que hace falta, negrita chica y gris —
 * el mismo tratamiento que el encabezado de la pestaña— y los rótulos de columnas numéricas a la
 * derecha, sobre sus números.
 *
 * @param {{sheetId:number, fila:number, textos:string[], anchos:number[],
 *          derecha?:number[], fontSize?:number, color?:object}} o  `fila` en base 1
 * @returns {object[]}
 */
export function requestsDeRotulos({ sheetId, fila, textos = [], anchos = [], derecha = [], fontSize = FONT_ROTULO, color = { red: 0.45, green: 0.45, blue: 0.45 } }) {
  if (!Number.isInteger(sheetId)) throw new Error('requestsDeRotulos: falta el sheetId')
  if (!(fila > 0)) throw new Error(`requestsDeRotulos: la fila de rótulos tiene que ser base 1, vino ${fila}`)
  const ancho = textos.length
  if (!ancho) return []
  const FMT = 'userEnteredFormat'
  const base = {
    repeatCell: {
      range: { sheetId, startRowIndex: fila - 1, endRowIndex: fila, startColumnIndex: 0, endColumnIndex: ancho },
      cell: {
        userEnteredFormat: {
          numberFormat: { type: 'TEXT', pattern: '@' },
          wrapStrategy: 'WRAP',
          verticalAlignment: 'BOTTOM',
          horizontalAlignment: 'LEFT',
          textFormat: { bold: true, fontSize, foregroundColor: color },
        },
      },
      fields: `${FMT}.numberFormat,${FMT}.wrapStrategy,${FMT}.verticalAlignment,${FMT}.horizontalAlignment,${FMT}.textFormat`,
    },
  }
  const aLaDerecha = derecha.map((c) => ({
    repeatCell: {
      range: { sheetId, startRowIndex: fila - 1, endRowIndex: fila, startColumnIndex: c, endColumnIndex: c + 1 },
      cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT' } },
      fields: `${FMT}.horizontalAlignment`,
    },
  }))
  const alto = {
    updateDimensionProperties: {
      range: { sheetId, dimension: 'ROWS', startIndex: fila - 1, endIndex: fila },
      properties: { pixelSize: altoDeRotulos(textos, anchos, fontSize) },
      fields: 'pixelSize',
    },
  }
  return [base, ...aLaDerecha, alto]
}
