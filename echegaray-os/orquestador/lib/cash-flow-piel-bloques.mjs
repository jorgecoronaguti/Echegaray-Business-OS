// LA PIEL DE LAS VISTAS DE BLOQUES — mucho blanco, un acento, y el rojo reservado para el déficit.
//
// ═══ DE DÓNDE SALE ESTE LENGUAJE VISUAL (05/08/2026) ═══
//
// El dueño pidió "producto de Treasury, no planilla". Destilado de lo que hacen Kyriba, Mercury y Brex
// —y de lo que NO hacen—, queda en cinco reglas que este archivo aplica y que se pueden discutir una
// por una:
//
//   1. RÓTULO CHICO GRIS, NÚMERO GRANDE. La jerarquía la hace el tamaño del número, no el color de
//      fondo. Un bloque con relleno de color pesa lo mismo que el de al lado y no jerarquiza nada.
//   2. UNA SOLA TIPOGRAFÍA (Arial, cuatro tamaños). Cada familia de más es una jerarquía que nadie
//      decidió — la trampa ya documentada en estilo-pestana.mjs.
//   3. UN SOLO ACENTO, para el saldo al cierre: es la cifra que decide.
//   4. EL ROJO ES DEL DÉFICIT REAL, y de nada más. Si se usa para todo negativo (una nota de crédito,
//      un mes que paga más de lo que cobra), deja de avisar.
//   5. NADA DE BORDES NI CAJAS. Una regla fina arriba de un total separa; un rectángulo encierra.
//
// ═══ LAS REGLAS CONDICIONALES SE BORRAN ANTES DE RE-CREARSE ═══
//
// `addConditionalFormatRule` APILA, igual que `addChart`: sin borrar primero, cada corrida del agente
// deja un juego más y a la semana la pestaña tiene doscientas reglas superpuestas. Y se anclan con
// referencia ABSOLUTA a su propia celda: con múltiples rangos en una sola regla, Sheets ajusta la
// fórmula relativa contra el PRIMER rango y las demás celdas terminan evaluando la condición de otra
// fila — un día crítico que no se pinta y uno tranquilo que sí.

import { MONEDA_CUERPO, MONEDA_TOTAL } from './formato-statement.mjs'
import { INK, MUTED, HAIR, ACENTO, BLANCO } from './estilo-statement.mjs'
import { FOOTPRINT, ANCHO_VISTA, COL_AUX } from './cash-flow-bloques.mjs'

const FUENTE = 'Arial'
/** El detalle, apagado contra la tinta de los titulares: se lee como respaldo, no como mensaje. */
const TENUE = { red: 0.36, green: 0.38, blue: 0.42 }
/** El único rojo del archivo: saldo bajo cero. */
export const DEFICIT = { red: 0.70, green: 0.20, blue: 0.20 }
/** Ámbar: por encima de cero pero por debajo del piso. Avisa sin gritar. */
export const AVISO = { red: 0.55, green: 0.40, blue: 0.05 }

const txt = (color, { bold = false, size = 10, italic = false } = {}) =>
  ({ foregroundColor: color, bold, italic, fontSize: size, fontFamily: FUENTE })

/**
 * NÚCLEO PURO: los requests de formato de una vista de bloques.
 *
 * @param {object} p
 * @param {number} p.sheetId
 * @param {object} p.meta el meta que devolvió la grilla
 * @param {'dia'|'mes'} p.tipo qué es cada bloque — decide el patrón de fecha del título
 * @param {number} [p.filasHoja] alto real de la hoja, para resetear también lo que quedó debajo
 * @param {number} [p.colsHoja]
 */
export function pielBloques({ sheetId, meta, tipo = 'dia', filasHoja = 0, colsHoja = 0 }) {
  const req = []
  const alto = Math.max(meta.filaFin ?? 0, FOOTPRINT.filas, filasHoja)
  const ancho = Math.max(FOOTPRINT.cols, colsHoja)
  // Un rango de alto o ancho cero devuelve 400 y tumba el lote entero, dejando la pestaña a medio
  // formatear. La guarda es la misma que en cash-flow-piel.mjs, y por el mismo incidente.
  const rango = (r0, r1, c0, c1) => (r1 > r0 && c1 > c0
    ? { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 }
    : null)
  const push = (r, fields, format) => { if (r) req.push({ repeatCell: { range: r, cell: { userEnteredFormat: format }, fields } }) }
  const fila = (f, fields, format, c0 = 0, c1 = ANCHO_VISTA) => push(rango(f - 1, f, c0, c1), fields, format)
  const regla = (f, lado) => {
    const r = rango(f - 1, f, 0, ANCHO_VISTA)
    if (r) req.push({ updateBorders: { range: r, [lado]: { style: 'SOLID', width: 1, color: HAIR } } })
  }

  // ── 1. La hoja: sin reja, con el título anclado ──────────────────────────────────────────────────
  req.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { hideGridlines: true, frozenRowCount: 2, frozenColumnCount: 1 } },
      fields: 'gridProperties(hideGridlines,frozenRowCount,frozenColumnCount)',
    },
  })
  // El reset: todo el footprint parte de blanco y cuerpo base. Sin él, la negrita o la itálica de la
  // corrida anterior aterriza sobre una fila que ahora significa otra cosa.
  push(rango(0, alto, 0, ancho), 'userEnteredFormat(backgroundColor,textFormat,numberFormat,horizontalAlignment)',
    { backgroundColor: BLANCO, textFormat: txt(INK, { size: 10 }), numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT' })
  {
    const r = rango(0, alto, 0, ancho)
    if (r) {
      req.push({
        updateBorders: {
          range: r,
          top: { style: 'NONE' }, bottom: { style: 'NONE' }, left: { style: 'NONE' }, right: { style: 'NONE' },
          innerHorizontal: { style: 'NONE' }, innerVertical: { style: 'NONE' },
        },
      })
    }
  }
  // La columna del importe es plata en toda la vista; la de la nota, texto apagado que no compite.
  push(rango(3, alto, 1, 2), 'userEnteredFormat(numberFormat,horizontalAlignment)',
    { numberFormat: MONEDA_CUERPO, horizontalAlignment: 'RIGHT' })
  push(rango(3, alto, 2, ANCHO_VISTA), 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment,wrapStrategy)',
    { numberFormat: { type: 'TEXT' }, textFormat: txt(MUTED, { size: 9 }), horizontalAlignment: 'LEFT', wrapStrategy: 'CLIP' })

  // ── 2. Título y subtítulo ────────────────────────────────────────────────────────────────────────
  fila(1, 'userEnteredFormat(textFormat,horizontalAlignment)', { textFormat: txt(INK, { bold: true, size: 16 }), horizontalAlignment: 'LEFT' })
  fila(2, 'userEnteredFormat(textFormat,horizontalAlignment)', { textFormat: txt(MUTED, { size: 9 }), horizontalAlignment: 'LEFT' })

  // ── 3. El hero: rótulo chico gris arriba, número grande debajo ───────────────────────────────────
  const hero = typeof meta.hero === 'number' ? meta.hero : meta.hero?.titulo
  if (hero) {
    push(rango(hero - 1, hero, 0, 1), 'userEnteredFormat.textFormat', { textFormat: txt(MUTED, { bold: true, size: 9 }) })
    push(rango(hero - 1, hero, 1, 2), 'userEnteredFormat(textFormat,numberFormat)',
      { textFormat: txt(ACENTO, { bold: true, size: 18 }), numberFormat: MONEDA_TOTAL })
    regla(hero, 'top')
  }

  // ── 4. Los bloques ───────────────────────────────────────────────────────────────────────────────
  const patronFecha = tipo === 'dia' ? 'dddd d "de" mmmm' : 'mmmm yyyy'
  const bloques = meta.dias ?? meta.meses ?? []
  for (const b of bloques) {
    // El título del bloque ES una fecha (valor, no texto): así se puede sumar y restar en las fórmulas
    // de las ventanas, y el formato la muestra escrita como la leería una persona.
    push(rango(b.filaTitulo - 1, b.filaTitulo, 0, 1), 'userEnteredFormat(textFormat,numberFormat)',
      { textFormat: txt(INK, { bold: true, size: 12 }), numberFormat: { type: 'DATE', pattern: patronFecha } })
    push(rango(b.filaTitulo - 1, b.filaTitulo, 1, 2), 'userEnteredFormat(textFormat,numberFormat)',
      { textFormat: txt(INK, { bold: true, size: 12 }), numberFormat: MONEDA_TOTAL })
    regla(b.filaTitulo, 'top')
    // El detalle del bloque, apagado.
    push(rango(b.filaTitulo, b.filaCierre - 1, 0, ANCHO_VISTA), 'userEnteredFormat.textFormat', { textFormat: txt(TENUE, { size: 10 }) })
    // El saldo al cierre: el ancla del bloque, con la doble raya del total general de un estado.
    push(rango(b.filaCierre - 1, b.filaCierre, 0, 1), 'userEnteredFormat.textFormat', { textFormat: txt(ACENTO, { bold: true, size: 10 }) })
    push(rango(b.filaCierre - 1, b.filaCierre, 1, 2), 'userEnteredFormat(textFormat,numberFormat)',
      { textFormat: txt(ACENTO, { bold: true, size: 11 }), numberFormat: MONEDA_TOTAL })
    regla(b.filaCierre, 'top')
    if (b.filaNeto) {
      push(rango(b.filaNeto - 1, b.filaNeto, 0, 2), 'userEnteredFormat.textFormat', { textFormat: txt(INK, { bold: true, size: 10 }) })
    }
  }

  // ── 5. Las secciones y los encabezados de tabla ──────────────────────────────────────────────────
  for (const f of meta.secciones ?? []) {
    fila(f, 'userEnteredFormat(textFormat,numberFormat)', { textFormat: txt(INK, { bold: true, size: 11 }), numberFormat: { type: 'TEXT' } })
    regla(f, 'top')
  }
  if (meta.cabSemanas) {
    fila(meta.cabSemanas, 'userEnteredFormat(textFormat,numberFormat,horizontalAlignment)',
      { textFormat: txt(MUTED, { bold: true, size: 9 }), numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT' })
    push(rango(meta.cabSemanas - 1, meta.cabSemanas, 1, ANCHO_VISTA), 'userEnteredFormat.horizontalAlignment', { horizontalAlignment: 'RIGHT' })
    regla(meta.cabSemanas, 'bottom')
  }
  for (const s of meta.semanas ?? []) {
    push(rango(s.fila - 1, s.fila, 0, 1), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'DATE', pattern: 'd/mm' } })
    push(rango(s.fila - 1, s.fila, 2, ANCHO_VISTA), 'userEnteredFormat(numberFormat,horizontalAlignment)',
      { numberFormat: MONEDA_CUERPO, horizontalAlignment: 'RIGHT' })
  }

  // ── 6. La zona auxiliar: oculta. Es maquinaria, y una vista no muestra maquinaria ────────────────
  req.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'COLUMNS', startIndex: ANCHO_VISTA, endIndex: COL_AUX + 16 },
      properties: { hiddenByUser: true }, fields: 'hiddenByUser',
    },
  })

  // ── 7. Anchos y altos ───────────────────────────────────────────────────────────────────────────
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 300 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 160 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 320 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: alto }, properties: { pixelSize: 21 }, fields: 'pixelSize' } })
  return req
}

/**
 * NÚCLEO PURO: las reglas condicionales de una vista.
 *
 * Dos por saldo al cierre —déficit real y por debajo del piso— y ninguna más. Cada una con la fórmula
 * anclada en absoluto a SU celda, por el motivo escrito arriba.
 *
 * @param {object} p
 * @param {number} p.sheetId
 * @param {object} p.meta
 * @param {string|null} p.refMinima rango con nombre de la caja mínima; sin él, sólo se marca el déficit
 * @param {number} [p.desde] índice donde se insertan (0 = arriba de todo)
 */
export function reglasCondicionales({ sheetId, meta, refMinima = null }) {
  const bloques = meta.dias ?? meta.meses ?? []
  const req = []
  const celdaB = (f) => ({ sheetId, startRowIndex: f - 1, endRowIndex: f, startColumnIndex: 1, endColumnIndex: 2 })
  const rule = (fila, formula, color, bold = true) => ({
    addConditionalFormatRule: {
      rule: {
        ranges: [celdaB(fila)],
        booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] }, format: { textFormat: { foregroundColor: color, bold } } },
      },
      index: 0,
    },
  })
  for (const b of bloques) {
    const c = `$B$${b.filaCierre}`
    // El orden importa: la primera regla que da verdadera gana. El déficit va primero porque un saldo
    // negativo también está por debajo del piso, y lo que hay que ver es que está bajo cero.
    req.push(rule(b.filaCierre, `=N(${c})<0`, DEFICIT))
    if (refMinima) req.push(rule(b.filaCierre, `=AND(N(${c})>=0;N(${c})<N(${refMinima}))`, AVISO))
  }
  // El piso del período, en el hero: si el mínimo de los catorce días cae bajo cero, es lo primero que
  // tiene que gritar la pestaña.
  if (meta.piso?.minimo) {
    const c = `$B$${meta.piso.minimo}`
    req.push(rule(meta.piso.minimo, `=N(${c})<0`, DEFICIT))
    if (refMinima) req.push(rule(meta.piso.minimo, `=AND(N(${c})>=0;N(${c})<N(${refMinima}))`, AVISO))
  }
  if (meta.piso?.colchon) req.push(rule(meta.piso.colchon, `=N($B$${meta.piso.colchon})<0`, DEFICIT))
  return req
}

/** Los requests para borrar TODAS las reglas condicionales de una pestaña, de atrás para adelante. */
export function borrarCondicionales(sheetId, cantidad = 0) {
  const req = []
  for (let i = cantidad - 1; i >= 0; i--) req.push({ deleteConditionalFormatRule: { sheetId, index: i } })
  return req
}
