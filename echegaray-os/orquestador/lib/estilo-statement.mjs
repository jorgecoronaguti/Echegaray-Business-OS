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
export function skinRequests({ sheetId, filas, cols, congeladas = 0, titular = 0 }) {
  const rango = (r0, r1, c0, c1) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const fmt = (r, fields, cell) => ({ repeatCell: { range: rango(r, r + 1, 0, cols), cell, fields } })
  const bg = (color) => ({ userEnteredFormat: { backgroundColor: color } })
  // ═══ UNA REGLA SE DIBUJA DEL ANCHO DE LA TABLA, NO DE LA HOJA ═══
  //
  // POR QUÉ (23/07). El dueño: "líneas marcadas que se cortan". Las reglas iban de la columna A a la
  // última de la grilla SIEMPRE, así que en un bloque que sólo llena cuatro columnas la línea seguía
  // ocho columnas más sobre la nada — y en la pantalla eso se lee como una línea rota, no como una
  // regla. Una regla existe para separar CONTENIDO: donde no hay contenido, no hay regla.
  const anchoDe = (r) => {
    let n = 0
    const f = filas[r] || []
    for (let j = 0; j < Math.min(f.length, cols); j++) if (String(f[j] ?? '').trim()) n = j + 1
    return Math.max(n, 1)
  }
  /** El ancho del bloque al que pertenece la fila r: el máximo de las filas contiguas con contenido. */
  const anchoBloque = (r) => {
    let n = anchoDe(r)
    for (let i = r + 1; i < filas.length && (filas[i] || []).some((x) => String(x ?? '').trim()); i++) n = Math.max(n, anchoDe(i))
    for (let i = r - 1; i >= 0 && (filas[i] || []).some((x) => String(x ?? '').trim()); i--) n = Math.max(n, anchoDe(i))
    return n
  }
  const hairline = (r) => ({ updateBorders: { range: rango(r, r + 1, 0, anchoBloque(r)), bottom: { style: 'SOLID', width: 1, color: HAIR } } })
  const hairlineTop = (r) => ({ updateBorders: { range: rango(r, r + 1, 0, anchoBloque(r)), top: { style: 'SOLID', width: 1, color: HAIR } } })

  const reqs = [
    { updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true, frozenRowCount: congeladas } }, fields: 'gridProperties(hideGridlines,frozenRowCount)' } },
    // Fondo blanco parejo: borra cualquier relleno viejo (barras teal, subtotales pintados).
    { repeatCell: { range: rango(0, filas.length, 0, cols), cell: bg(BLANCO), fields: 'userEnteredFormat.backgroundColor' } },
    // ═══ EL RESET DEL CUERPO — LO QUE FALTABA ═══
    //
    // POR QUÉ (23/07). La piel formateaba los títulos, los encabezados y los totales, y a las demás
    // filas NO LES TOCABA NADA. Así que cuando el layout cambiaba, la itálica o la negrita de la
    // versión anterior aterrizaba sobre una fila que no tenía nada que ver: en Cargas Sociales
    // "Aportes de Seguridad Social" salía en itálica y "Contribuciones de Obra Social" en redonda,
    // sin ninguna regla detrás. Eso es exactamente lo que hace que un cuadro se lea desprolijo y no
    // se pueda seguir con el ojo. El cuerpo arranca parejo y después se marcan las excepciones.
    { repeatCell: { range: rango(0, filas.length, 0, cols), cell: { userEnteredFormat: { textFormat: txt(INK, { bold: false, size: 10 }) } }, fields: 'userEnteredFormat.textFormat' } },
    // Y ninguna regla heredada de un layout viejo: se borran todas antes de dibujar las nuevas.
    { updateBorders: { range: rango(0, filas.length, 0, cols), top: { style: 'NONE' }, bottom: { style: 'NONE' }, left: { style: 'NONE' }, right: { style: 'NONE' }, innerHorizontal: { style: 'NONE' }, innerVertical: { style: 'NONE' } } },
  ]

  filas.forEach((fila, i) => {
    const a = String(fila?.[0] ?? '').trim()
    if (!a && !(fila || []).some((x) => String(x ?? '').trim())) return
    if (i === 0) { // Título de la pestaña.
      reqs.push(fmt(i, 'userEnteredFormat(textFormat,horizontalAlignment)', { userEnteredFormat: { textFormat: txt(INK, { bold: true, size: 15 }), horizontalAlignment: 'LEFT' } }))
      return
    }
    if (i === 1) { // El subtítulo: apagado y chico, no compite con nada.
      reqs.push(fmt(i, 'userEnteredFormat(textFormat,horizontalAlignment)', { userEnteredFormat: { textFormat: txt(MUTED, { size: 9 }), horizontalAlignment: 'LEFT' } }))
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
    // UN TÍTULO DE SECCIÓN OCUPA SU FILA SOLO. Sin esta condición, un rótulo de concepto que está en
    // versalita —"L.R.T. — ART", el nombre de un proveedor— salía en negrita con una regla encima,
    // como si abriera un bloque nuevo. Un renglón con importes al lado nunca es un título.
    const soloEnSuFila = !(fila || []).slice(1).some((x) => String(x ?? '').trim())
    if (soloEnSuFila && ES_SECCION.test(a)) { // Sección: tinta, negrita, hairline arriba.
      reqs.push(fmt(i, 'userEnteredFormat(textFormat,horizontalAlignment)', { userEnteredFormat: { textFormat: txt(INK, { bold: true, size: 11 }), horizontalAlignment: 'LEFT' } }), hairlineTop(i))
    }
  })
  // ═══ EL TITULAR ES EL NÚMERO MÁS FUERTE DE LA PÁGINA ═══
  // Una pestaña contesta UNA pregunta. Su respuesta tiene que verse desde lejos y sin buscarla; el
  // resto es el respaldo de esa respuesta. Sin esto, la cifra que importa pesa igual que las otras
  // ochenta y hay que leer la pestaña entera para encontrarla.
  if (titular) {
    // 13 puntos, no 18: a 18 el rótulo desbordaba su columna y el importe salía cortado a la mitad
    // ("$11.084.4"). Un titular que no entra en su celda no es un titular, es un error de imprenta.
    // La jerarquía la termina de dar el ACENTO, que ninguna otra fila usa.
    reqs.push({ repeatCell: { range: rango(titular - 1, titular, 0, 2), cell: { userEnteredFormat: { textFormat: txt(ACENTO, { bold: true, size: 13 }) } }, fields: 'userEnteredFormat.textFormat' } })
    reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: titular - 1, endIndex: titular }, properties: { pixelSize: 26 }, fields: 'pixelSize' } })
  }
  return reqs
}
