// EL FORMATO DE «Nómina» DE LA SECCIÓN 6 PARA ABAJO, Y DE LOS PARÁMETROS NUEVOS. PURO.
//
// ═══ EL DEFECTO QUE ESTO CIERRA (dueño, 25/09/2026: «el formato de la pestaña Nómina está roto») ═══
//
// Los cuadros 1–5 los armó el dueño con una piel propia (Arial, tinta #192133, cabecera gris
// #f2f2ef, línea #d1ccc1, números `#,##0;(#,##0);"—"`). El 24/09 entraron el cuadro 6 (el puente al
// Cash Flow, `nomina-puente-cash-flow.mjs`) y las secciones 7–10 (`nomina-unificar-jornales.mjs`), y
// los dos generadores escriben SÓLO valores. Cayeron sobre filas con formato TEXTO heredado, así que
// el encabezado de meses salía como seriales (46023, 46054…), los importes con decimales sueltos
// (9103378,78), la sección 10 con fechas-serial y factores sin formato, y ninguna sección tenía
// título, cabecera ni línea. Lo mismo las columnas N–Q de los parámetros, agregadas después de B–M.
//
// Ningún paso del pipeline formatea «Nómina» (`formato-pestanas.mjs` la declara `propio`), así que
// el formato lo tiene que poner quien escribe: los dos generadores llaman a esto después de escribir.
//
// ═══ QUÉ TOCA Y QUÉ NO ═══
//
// · SÓLO apariencia: `repeatCell` con `fields` acotados a `userEnteredFormat.*`, `updateBorders` y
//   el alto de las filas de cabecera que envuelven. Ningún pedido lleva un valor ni una fórmula.
// · Las filas se ubican por RÓTULO de la columna A. Una sección que no está se saltea sin error: el
//   cuadro puede estar a medio migrar y el formato no puede ser lo que tire la corrida.
// · Los cuadros 1–5 no se tocan: son del dueño y ya tienen su piel.

const rgb = (h) => ({ red: parseInt(h.slice(1, 3), 16) / 255, green: parseInt(h.slice(3, 5), 16) / 255, blue: parseInt(h.slice(5, 7), 16) / 255 })
export const PIEL_NOMINA = Object.freeze({
  INK: rgb('#192133'), MUTED: rgb('#87847c'), CAP: rgb('#5b606b'), HEAD: rgb('#f2f2ef'),
  HAIR: rgb('#d1ccc1'), BLANCO: rgb('#ffffff'), INPUT: rgb('#fff8d5'), INPUT_BORDE: rgb('#cca300'),
})
export const FORMATOS_NOMINA = Object.freeze({
  NUM: { type: 'NUMBER', pattern: '#,##0;(#,##0);"—"' },
  FECHA: { type: 'DATE', pattern: 'dd/mm/yyyy' },
  MES: { type: 'DATE', pattern: 'mmm yy' },
  ENTERO: { type: 'NUMBER', pattern: '0' },
  PCT1: { type: 'PERCENT', pattern: '0.0%' },
  PCT2: { type: 'PERCENT', pattern: '0.00%' },
  FACTOR: { type: 'NUMBER', pattern: '0.0000' },
  TEXTO: { type: 'TEXT' },
})

/**
 * Los pedidos de formato para `spreadsheetBatchUpdate`.
 *
 * @param {Array<string>} colA la columna A de «Nómina» desde A1 (valores, ya como texto)
 * @param {number} sheetId
 * @returns {{requests:Array<object>, anclas:Record<string, number>, faltan:Array<string>}}
 */
export function pedidosDeFormatoNomina(colA = [], sheetId) {
  const { INK, MUTED, CAP, HEAD, HAIR, BLANCO, INPUT, INPUT_BORDE } = PIEL_NOMINA
  const { NUM, FECHA, MES, ENTERO, PCT1, PCT2, FACTOR, TEXTO } = FORMATOS_NOMINA
  const A = colA.map((t) => String(t ?? '').trim())
  const busca = (re, desde = 0) => { for (let i = desde; i < A.length; i++) if (re.test(A[i])) return i + 1; return 0 }
  const C = (l) => l.charCodeAt(0) - 65
  const R = (f0, f1, c0, c1) => ({ sheetId, startRowIndex: f0 - 1, endRowIndex: f1, startColumnIndex: C(c0), endColumnIndex: C(c1) + 1 })
  const requests = []
  const anclas = {}
  const faltan = []
  const cel = (rango, { nf, bold = false, size = 10, fg = INK, bg = BLANCO, al, italic = false, wrap } = {}) => {
    if (!(rango.startRowIndex < rango.endRowIndex)) return
    const f = { textFormat: { fontFamily: 'Arial', fontSize: size, bold, italic, foregroundColor: fg }, backgroundColor: bg }
    const campos = ['textFormat', 'backgroundColor']
    if (nf) { f.numberFormat = nf; campos.push('numberFormat') }
    if (al) { f.horizontalAlignment = al; campos.push('horizontalAlignment') }
    if (wrap) { f.wrapStrategy = wrap; f.verticalAlignment = 'MIDDLE'; campos.push('wrapStrategy', 'verticalAlignment') }
    requests.push({ repeatCell: { range: rango, cell: { userEnteredFormat: f }, fields: campos.map((c) => `userEnteredFormat.${c}`).join(',') } })
  }
  const linea = (rango, lado, color = HAIR) => requests.push({ updateBorders: { range: rango, [lado]: { style: 'SOLID', colorStyle: { rgbColor: color } } } })
  const alto = (f, px) => requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: f - 1, endIndex: f }, properties: { pixelSize: px }, fields: 'pixelSize' } })
  const titulo = (f, c1 = 'P') => { cel(R(f, f, 'A', c1), { size: 11, bold: true }); linea(R(f, f, 'A', c1), 'top') }
  const cabecera = (f, c1, { meses = false } = {}) => {
    cel(R(f, f, 'A', 'A'), { size: 9, bold: true, fg: MUTED, bg: HEAD, al: 'LEFT', wrap: 'WRAP' })
    cel(R(f, f, 'B', c1), { size: 9, bold: true, fg: MUTED, bg: HEAD, al: 'CENTER', wrap: 'WRAP' })
    if (meses) cel(R(f, f, 'D', 'O'), { size: 9, bold: true, fg: MUTED, bg: HEAD, al: 'CENTER', nf: MES })
    linea(R(f, f, 'A', c1), 'bottom')
    alto(f, 34)
  }
  const texto = (r) => cel(r, { al: 'LEFT' })
  const anclar = (nombre, re, desde = 0) => { const f = busca(re, desde); if (f) anclas[nombre] = f; else faltan.push(nombre); return f }

  // ── Parámetros: la fila de rótulos y la de leyendas envuelven; N5 es el INPUT que mueve el Cash Flow ──
  const fPar = anclar('parámetros', /^Parámetros$/)
  if (fPar) {
    cel(R(fPar, fPar, 'B', 'Q'), { size: 9, bold: true, fg: MUTED, al: 'CENTER', wrap: 'WRAP' })
    cel(R(fPar + 1, fPar + 1, 'I', 'I'), { nf: PCT2, al: 'CENTER' })
    cel(R(fPar + 1, fPar + 1, 'N', 'N'), { bold: true, bg: INPUT, al: 'CENTER', wrap: 'WRAP' })
    requests.push({ updateBorders: { range: R(fPar + 1, fPar + 1, 'N', 'N'), ...Object.fromEntries(['top', 'bottom', 'left', 'right'].map((k) => [k, { style: 'SOLID', colorStyle: { rgbColor: INPUT_BORDE } }])) } })
    cel(R(fPar + 1, fPar + 1, 'O', 'O'), { al: 'CENTER' })
    cel(R(fPar + 1, fPar + 1, 'P', 'P'), { nf: PCT1, al: 'CENTER' })
    cel(R(fPar + 1, fPar + 1, 'Q', 'Q'), { nf: NUM, al: 'CENTER' })
    cel(R(fPar + 2, fPar + 2, 'B', 'Q'), { size: 8, italic: true, fg: CAP, al: 'CENTER', wrap: 'WRAP' })
    alto(fPar, 34); alto(fPar + 1, 34); alto(fPar + 2, 46)
  }

  // ── 4 · Dirección: el «Retiro mensual» es plata ──
  const fDir = anclar('4 · DIRECCIÓN', /^4 · DIRECCIÓN/)
  const fTotDir = fDir ? busca(/^TOTAL DIRECCIÓN$/, fDir) : 0
  if (fDir && fTotDir) {
    cel(R(fDir + 2, fTotDir - 1, 'B', 'B'), { nf: NUM, al: 'RIGHT' })
    cel(R(fTotDir, fTotDir, 'B', 'B'), { nf: NUM, al: 'RIGHT', bold: true })
  }

  // ── 6 · Lo que va al Cash Flow: cinco renglones, doce meses y el total ──
  const f6 = anclar('6', /^6 · LO QUE VA AL CASH FLOW/)
  if (f6) {
    titulo(f6); cabecera(f6 + 1, 'P', { meses: true })
    texto(R(f6 + 2, f6 + 6, 'A', 'A'))
    cel(R(f6 + 2, f6 + 6, 'D', 'O'), { nf: NUM, al: 'RIGHT' })
    cel(R(f6 + 2, f6 + 6, 'P', 'P'), { nf: NUM, al: 'RIGHT', bold: true })
  }

  // ── 7 · Quincenas pagadas: el derrame de A crece; se formatea hasta el rótulo siguiente ──
  // LAS SECCIONES 7–10 YA NO SON UN ESPEJO (25/09/2026): el registro de jornales se mudó a «Nómina» y
  // lo formatea quien lo escribe, `jornales-pestana.mjs` (recortado a sus filas). Formatearlo también
  // acá sería pelear dos pieles sobre las mismas celdas.
  return { requests, anclas, faltan }
}

/** Aplica el formato leyendo la columna A viva. Devuelve lo mismo que `pedidosDeFormatoNomina`. */
export async function formatearNomina(google, fileId, { pestana = 'Nómina' } = {}) {
  const hoja = (await google.getSheetMeta(fileId)).find((h) => h.title === pestana)
  if (!hoja) throw new Error(`no existe la pestaña ${pestana}`)
  const col = await google.readSheetValues(fileId, `'${pestana}'!A1:A400`, { render: 'UNFORMATTED_VALUE' })
  const r = pedidosDeFormatoNomina(col.map((x) => x?.[0]), hoja.sheetId)
  if (r.requests.length) {
    const res = await google.spreadsheetBatchUpdate(fileId, r.requests, { yaGuardado: true })
    if (res?.protegido) throw new Error(`la guarda no dejó formatear ${pestana}: ${res.motivo ?? ''}`)
  }
  return r
}
