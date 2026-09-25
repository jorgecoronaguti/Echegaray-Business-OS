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
  const f7 = anclar('7', /^7 · QUINCENAS PAGADAS/)
  const f8 = anclar('8', /^8 · QUINCENAS A PAGAR/, f7)
  const f9 = anclar('9', /^9 · OFICINA Y JEFES/, f8)
  const f10 = anclar('10', /^10 · CONVENIO UOCRA/, f9)
  if (f7) {
    const fin = (f8 || f7 + 32) - 2
    titulo(f7); cabecera(f7 + 1, 'I')
    cel(R(f7 + 2, fin, 'A', 'C'), { nf: FECHA, al: 'CENTER' })
    cel(R(f7 + 2, fin, 'D', 'D'), { nf: ENTERO, al: 'CENTER' })
    cel(R(f7 + 2, fin, 'E', 'H'), { nf: NUM, al: 'RIGHT' })
    cel(R(f7 + 2, fin, 'I', 'I'), { nf: FECHA, al: 'CENTER' })
  }
  // ── 8 · Quincenas a pagar ──
  if (f8) {
    const fin = (f9 || f8 + 11) - 2
    titulo(f8); cabecera(f8 + 1, 'D')
    cel(R(f8 + 2, fin, 'A', 'C'), { nf: FECHA, al: 'CENTER' })
    cel(R(f8 + 2, fin, 'D', 'D'), { nf: NUM, al: 'RIGHT' })
  }
  // ── 9 · Oficina y jefes · Dirección · por mes: doce filas ──
  if (f9) {
    titulo(f9); cabecera(f9 + 1, 'H')
    texto(R(f9 + 2, f9 + 13, 'A', 'A'))
    for (const c of ['B', 'D', 'F', 'H']) cel(R(f9 + 2, f9 + 13, c, c), { nf: NUM, al: 'RIGHT' })
    for (const c of ['C', 'G']) cel(R(f9 + 2, f9 + 13, c, c), { nf: FECHA, al: 'CENTER' })
  }
  // ── 10 · Convenio UOCRA: plantel, escalón y control de piso (espejo de la sección de Jornales) ──
  if (f10) {
    titulo(f10); cabecera(f10 + 1, 'H')
    const fPlantel = busca(/^⇒ Plantel vigente/, f10)
    if (fPlantel) {
      texto(R(f10 + 2, fPlantel, 'A', 'A'))
      cel(R(f10 + 2, fPlantel - 1, 'B', 'B'), { nf: ENTERO, al: 'CENTER' })
      for (const c of ['C', 'D', 'F', 'G']) cel(R(f10 + 2, fPlantel - 1, c, c), { nf: NUM, al: 'RIGHT' })
      cel(R(f10 + 2, fPlantel - 1, 'E', 'E'), { nf: TEXTO, al: 'CENTER' })
      texto(R(f10 + 2, fPlantel, 'H', 'H'))
      cel(R(fPlantel, fPlantel, 'A', 'A'), { bold: true, al: 'LEFT' })
      cel(R(fPlantel, fPlantel, 'B', 'B'), { bold: true, nf: ENTERO, al: 'CENTER' })
      for (const c of ['C', 'D', 'F', 'G']) cel(R(fPlantel, fPlantel, c, c), { bold: true, nf: NUM, al: 'RIGHT' })
      cel(R(fPlantel, fPlantel, 'H', 'H'), { bold: true, al: 'LEFT' })
      linea(R(fPlantel, fPlantel, 'A', 'H'), 'top')
    }
    const fEsc = busca(/^\d+\.\d+ · ESCALÓN/, f10)
    const fPiso = fEsc ? busca(/^\d+\.\d+ · CONTROL DE PISO/, fEsc) : 0
    if (fEsc && fPiso) {
      cel(R(fEsc, fEsc, 'A', 'H'), { bold: true })
      cabecera(fEsc + 1, 'H')
      const fin = fPiso - 2
      cel(R(fEsc + 2, fin, 'A', 'A'), { nf: MES, al: 'LEFT' })
      texto(R(fEsc + 2, fin, 'B', 'B'))
      cel(R(fEsc + 2, fin, 'C', 'C'), { nf: NUM, al: 'RIGHT' })
      cel(R(fEsc + 2, fin, 'D', 'D'), { nf: PCT1, al: 'RIGHT' })
      cel(R(fEsc + 2, fin, 'E', 'E'), { nf: FACTOR, al: 'RIGHT' })
      cel(R(fEsc + 2, fin, 'F', 'F'), { nf: NUM, al: 'RIGHT' })
      texto(R(fEsc + 2, fin, 'G', 'H'))
      cel(R(fPiso, fPiso, 'A', 'H'), { bold: true })
      const fCat = busca(/^Categoría$/, fPiso)
      const hasta = fCat || fPiso + 7
      for (let f = fPiso + 1; f < hasta; f++) {
        texto(R(f, f, 'A', 'A'))
        cel(R(f, f, 'B', 'B'), { nf: /^Margen/.test(A[f - 1]) ? PCT1 : NUM, al: 'RIGHT' })
      }
      if (fCat) {
        cabecera(fCat, 'B')
        let fFin = fCat; while (fFin < A.length && A[fFin] !== '') fFin++
        texto(R(fCat + 1, fFin, 'A', 'A')); cel(R(fCat + 1, fFin, 'B', 'B'), { nf: NUM, al: 'RIGHT' })
      }
    }
  }
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
