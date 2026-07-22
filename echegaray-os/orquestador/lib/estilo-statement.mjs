// PIEL DE STATEMENT — el salto de "planilla" a "cómo se vería en JPMorgan".
//
// POR QUÉ EXISTE (22/07). El dueño: cada pestaña tiene que quedar minimalista y de clase mundial.
// El estilo compartido (estilo-pestana.mjs) ya usa un teal sobrio, pero le faltan las tres cosas que
// separan un statement de una planilla, y que ya se aplicaron a mano en CAJA y en Cheques Emitidos:
//
//   1. SIN reja (gridlines off) — el mayor "tell" de planilla.
//   2. Sin barras de color rellenas: los encabezados y las secciones se marcan con TIPOGRAFÍA (tinta,
//      versalita) y una línea fina (hairline), no con un rectángulo pintado.
//   3. Totales RULADOS: una línea fina arriba, el número en acento; no un relleno.
//
// Es una CAPA que se aplica ENCIMA del formato de número que ya puso el generador (moneda, fecha):
// sólo cambia fondo, bordes y la tipografía de las filas de estructura. Detecta la estructura por el
// CONTENIDO de la columna A (título, sección "N. …", encabezado de tabla, total) para poder reusarse
// en cualquier pestaña sin que cada generador le pase las filas a mano.

export const INK = { red: 0.10, green: 0.13, blue: 0.20 }
export const MUTED = { red: 0.53, green: 0.52, blue: 0.49 }
export const HAIR = { red: 0.82, green: 0.80, blue: 0.76 }
export const ACENTO = { red: 0.11, green: 0.23, blue: 0.37 }
export const BLANCO = { red: 1, green: 1, blue: 1 }

const txt = (color, { bold = false, size = 10, italic = false } = {}) => ({ foregroundColor: color, bold, italic, fontSize: size, fontFamily: 'Arial' })

/** Reglas de detección por el contenido de la columna A. El orden importa: total antes que sección. */
export const ES_TOTAL = /^\s*(⇒|total\b|⚠ )/i
export const ES_SECCION = /^\s*\d+\s*[.\-·]\s+\S|^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 ,.·/—-]{10,}$/
export const ES_ENCABEZADO = /^(per[ií]odo|concepto|plan|proveedor|obra|rubro|familia|cuenta|tipo|n[°º]|fecha|mes|semana)\b/i

/**
 * NÚCLEO PURO: los requests de formato de la piel, a partir del contenido escrito.
 * @param {{sheetId:number, filas:string[][], cols:number, congeladas?:number}} p
 * @returns {object[]} requests para spreadsheetBatchUpdate
 */
export function skinRequests({ sheetId, filas, cols, congeladas = 0 }) {
  const rango = (r0, r1, c0, c1) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const fmt = (r, fields, cell) => ({ repeatCell: { range: rango(r, r + 1, 0, cols), cell, fields } })
  const bg = (color) => ({ userEnteredFormat: { backgroundColor: color } })
  const hairline = (r) => ({ updateBorders: { range: rango(r, r + 1, 0, cols), bottom: { style: 'SOLID', width: 1, color: HAIR } } })
  const hairlineTop = (r) => ({ updateBorders: { range: rango(r, r + 1, 0, cols), top: { style: 'SOLID', width: 1, color: HAIR } } })

  const reqs = [
    { updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true, frozenRowCount: congeladas } }, fields: 'gridProperties(hideGridlines,frozenRowCount)' } },
    // Fondo blanco parejo: borra cualquier relleno viejo (barras teal, subtotales pintados).
    { repeatCell: { range: rango(0, filas.length, 0, cols), cell: bg(BLANCO), fields: 'userEnteredFormat.backgroundColor' } },
  ]

  filas.forEach((fila, i) => {
    const a = String(fila?.[0] ?? '').trim()
    if (!a && !(fila || []).some((x) => String(x ?? '').trim())) return
    if (i === 0) { // Título de la pestaña.
      reqs.push(fmt(i, 'userEnteredFormat(textFormat,horizontalAlignment)', { userEnteredFormat: { textFormat: txt(INK, { bold: true, size: 15 }), horizontalAlignment: 'LEFT' } }))
      return
    }
    if (ES_TOTAL.test(a)) { // Total: rulado, tinta, negrita.
      reqs.push(fmt(i, 'userEnteredFormat(textFormat)', { userEnteredFormat: { textFormat: txt(INK, { bold: true, size: 10 }) } }), hairlineTop(i))
      return
    }
    if (ES_ENCABEZADO.test(a)) { // Encabezado de tabla: versalita apagada + hairline abajo.
      reqs.push(fmt(i, 'userEnteredFormat(textFormat,horizontalAlignment)', { userEnteredFormat: { textFormat: txt(MUTED, { bold: true, size: 9 }), horizontalAlignment: 'LEFT' } }), hairline(i))
      return
    }
    if (ES_SECCION.test(a)) { // Sección: tinta, negrita, hairline arriba.
      reqs.push(fmt(i, 'userEnteredFormat(textFormat,horizontalAlignment)', { userEnteredFormat: { textFormat: txt(INK, { bold: true, size: 11 }), horizontalAlignment: 'LEFT' } }), hairlineTop(i))
    }
  })
  return reqs
}
