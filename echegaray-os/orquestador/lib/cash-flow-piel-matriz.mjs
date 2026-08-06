// LA PIEL DE LAS DOS MATRICES DE CASH FLOW — poca tinta, una fila que decide, y el rojo del déficit.
//
// ═══ LAS REGLAS, HEREDADAS Y RECORTADAS (06/08/2026) ═══
//
//   1. RÓTULO CHICO GRIS, NÚMERO EN NEGRITA. En una matriz la jerarquía la dan la fila y el peso, no
//      el tamaño: un cuerpo 18 no entra en una columna de 95px y Sheets lo tapa con "###" sin avisar.
//   2. UNA SOLA TIPOGRAFÍA (Arial, tres tamaños).
//   3. UN SOLO ACENTO, para el saldo final: es la fila que decide.
//   4. EL ROJO ES DEL DÉFICIT REAL, y de nada más. Si se usa para todo negativo deja de avisar.
//   5. NADA DE BORDES NI CAJAS. Una regla fina separa; un rectángulo encierra.
//
// ═══ LA COLUMNA A VA CONGELADA, Y ES NUEVO ═══
//
// Las vistas de bloques no lo necesitaban (todo entraba en tres columnas). Una matriz scrollea en
// horizontal: sin congelar la columna del concepto, tres columnas a la derecha ya no se sabe qué fila
// se está leyendo. Se congelan las siete primeras filas (título, hero y encabezado) y la columna A.
//
// ═══ LAS REGLAS CONDICIONALES SE BORRAN ANTES DE RE-CREARSE ═══
//
// `addConditionalFormatRule` APILA: sin borrar primero, cada corrida deja un juego más y a la semana
// la pestaña tiene doscientas reglas superpuestas.
//
// Y VAN SOBRE UN RANGO CONTIGUO CON LA FÓRMULA RELATIVA A SU PRIMERA CELDA. La versión de bloques
// escribía una regla por celda porque sus celdas NO eran contiguas —una por bloque— y con varios
// rangos en una sola regla Sheets ajusta la fórmula contra el PRIMER rango: un día crítico sin pintar
// y uno tranquilo pintado. Acá la fila entera es un rango, así que una regla alcanza y el ajuste
// relativo es exactamente el que se quiere: la columna corre, la fila queda fija (`B$14`).

import { MONEDA_CUERPO, MONEDA_TOTAL } from './formato-statement.mjs'
import { INK, MUTED, HAIR, ACENTO, BLANCO } from './estilo-statement.mjs'
import { FILA } from './cash-flow-matriz.mjs'

const FUENTE = 'Arial'
/** El detalle, apagado contra la tinta de los titulares: se lee como respaldo, no como mensaje. */
const TENUE = { red: 0.36, green: 0.38, blue: 0.42 }
/** El gris del encabezado de la matriz. Suave: marca la banda sin competir con los números. */
const GRIS_SUAVE = { red: 0.95, green: 0.95, blue: 0.94 }
/** El único rojo del archivo: saldo bajo cero. */
export const DEFICIT = { red: 0.70, green: 0.20, blue: 0.20 }
/** Ámbar: por encima de cero pero por debajo del piso. Avisa sin gritar. */
export const AVISO = { red: 0.55, green: 0.40, blue: 0.05 }
/** El tinte de un desvío negativo: rojo apagado, sin negrita. No es un déficit, es una señal. */
export const TINTE = { red: 0.62, green: 0.31, blue: 0.28 }

/** Ancho de cada zona, en píxeles. La columna del concepto tiene que alojar "Variación vs presupuesto". */
export const ANCHOS = Object.freeze({ concepto: 260, tiempo: 95, total: 110 })
/** Alto de fila normal. Una matriz no necesita aire vertical: lo que la hace legible es la grilla. */
export const ALTO_FILA = 21

const txt = (color, { bold = false, size = 10, italic = false } = {}) =>
  ({ foregroundColor: color, bold, italic, fontSize: size, fontFamily: FUENTE })

/**
 * NÚCLEO PURO: los requests de formato de una matriz de cash flow.
 *
 * @param {object} p
 * @param {number} p.sheetId
 * @param {object} p.meta el meta que devolvió la grilla
 * @param {number} [p.filasHoja] alto real de la hoja, para resetear también lo que quedó debajo
 * @param {number} [p.colsHoja]
 */
export function pielMatriz({ sheetId, meta, filasHoja = 0, colsHoja = 0 }) {
  const req = []
  const alto = Math.max(meta.footprint.filas, filasHoja)
  const ancho = Math.max(meta.footprint.cols, colsHoja)
  // Un rango de alto o ancho cero devuelve 400 y tumba el lote entero, dejando la pestaña a medio
  // formatear. La guarda es la misma que en el resto del repo, y por el mismo incidente.
  const rango = (r0, r1, c0, c1) => (r1 > r0 && c1 > c0
    ? { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 }
    : null)
  const push = (r, fields, format) => { if (r) req.push({ repeatCell: { range: r, cell: { userEnteredFormat: format }, fields } }) }
  const celdas = (f, c0, c1, fields, format) => push(rango(f - 1, f, c0, c1), fields, format)
  const reglaFina = (f, lado, c0 = 0, c1 = meta.footprint.cols) => {
    const r = rango(f - 1, f, c0, c1)
    if (r) req.push({ updateBorders: { range: r, [lado]: { style: 'SOLID', width: 1, color: HAIR } } })
  }
  const col0 = meta.cab.col0
  const colUltima = meta.cab.colTotal

  // ── 1. La hoja: sin reja, con el encabezado y el concepto anclados ───────────────────────────────
  req.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { hideGridlines: true, frozenRowCount: FILA.cabecera, frozenColumnCount: 1 } },
      fields: 'gridProperties(hideGridlines,frozenRowCount,frozenColumnCount)',
    },
  })
  // El reset: todo el footprint parte de blanco y cuerpo base. Sin él, la negrita de la corrida
  // anterior aterriza sobre una fila que ahora significa otra cosa.
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

  formatoEncabezado({ celdas, meta })
  formatoHero({ celdas, reglaFina, meta })
  formatoCuerpo({ push, celdas, reglaFina, rango, meta, col0, colUltima })

  // ── Anchos y altos ──────────────────────────────────────────────────────────────────────────────
  const dim = (dimension, i0, i1, pixelSize) => req.push({
    updateDimensionProperties: { range: { sheetId, dimension, startIndex: i0, endIndex: i1 }, properties: { pixelSize }, fields: 'pixelSize' },
  })
  dim('COLUMNS', 0, 1, ANCHOS.concepto)
  dim('COLUMNS', col0, colUltima, ANCHOS.tiempo)
  dim('COLUMNS', colUltima, colUltima + 1, ANCHOS.total)
  dim('ROWS', 0, alto, ALTO_FILA)
  return req
}

/** Título, subtítulo y el atajo de la esquina. */
function formatoEncabezado({ celdas, meta }) {
  celdas(FILA.titulo, 0, 1, 'userEnteredFormat(textFormat,horizontalAlignment)',
    { textFormat: txt(INK, { bold: true, size: 16 }), horizontalAlignment: 'LEFT' })
  celdas(FILA.subtitulo, 0, 1, 'userEnteredFormat(textFormat,horizontalAlignment)',
    { textFormat: txt(MUTED, { size: 9 }), horizontalAlignment: 'LEFT' })
  celdas(FILA.subtitulo, meta.cab.colTotal, meta.cab.colTotal + 1, 'userEnteredFormat(textFormat,horizontalAlignment)',
    { textFormat: txt(ACENTO, { size: 9 }), horizontalAlignment: 'RIGHT' })
}

/** Las cuatro cifras del titular: rótulo chico gris arriba, número en negrita debajo, glosa apagada. */
function formatoHero({ celdas, reglaFina, meta }) {
  for (const s of meta.hero.slots) {
    celdas(meta.hero.rotulo, s, s + 1, 'userEnteredFormat.textFormat', { textFormat: txt(MUTED, { bold: true, size: 9 }) })
    celdas(meta.hero.valor, s, s + 1, 'userEnteredFormat(textFormat,numberFormat,horizontalAlignment)',
      { textFormat: txt(ACENTO, { bold: true, size: 11 }), numberFormat: MONEDA_TOTAL, horizontalAlignment: 'LEFT' })
    celdas(meta.hero.valor, s + 1, s + 2, 'userEnteredFormat(textFormat,numberFormat)',
      { textFormat: txt(TENUE, { size: 9 }), numberFormat: { type: 'TEXT' } })
  }
  reglaFina(meta.hero.rotulo, 'top')
}

/** El encabezado de la matriz y sus filas de concepto. */
function formatoCuerpo({ push, celdas, reglaFina, rango, meta, col0, colUltima }) {
  const f = meta.fila
  const filaFin = meta.filaFin
  const patron = meta.tipo === 'mes' ? 'mmm yy' : 'dd/mm'

  // El encabezado: banda gris suave, y las fechas como FECHAS (el valor es un serial; el patrón sólo
  // decide cómo se lee). Si se escribiera el texto "1/12/2026", CF_MESES prometería doce fechas y
  // entregaría once y una cadena — que es exactamente lo que pasó en el Mensual anterior.
  celdas(meta.cab.fila, 0, meta.footprint.cols, 'userEnteredFormat(backgroundColor,textFormat)',
    { backgroundColor: GRIS_SUAVE, textFormat: txt(MUTED, { bold: true, size: 9 }) })
  celdas(meta.cab.fila, col0, colUltima, 'userEnteredFormat(numberFormat,horizontalAlignment)',
    { numberFormat: { type: 'DATE', pattern: patron }, horizontalAlignment: 'RIGHT' })
  celdas(meta.cab.fila, colUltima, colUltima + 1, 'userEnteredFormat(numberFormat,horizontalAlignment)',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'RIGHT' })
  reglaFina(meta.cab.fila, 'bottom')

  // El cuerpo: el concepto a la izquierda, plata a la derecha en toda la matriz.
  push(rango(FILA.concepto - 1, filaFin, 0, 1), 'userEnteredFormat(textFormat,horizontalAlignment)',
    { textFormat: txt(INK, { size: 10 }), horizontalAlignment: 'LEFT' })
  push(rango(FILA.concepto - 1, filaFin, col0, colUltima + 1), 'userEnteredFormat(numberFormat,horizontalAlignment)',
    { numberFormat: MONEDA_CUERPO, horizontalAlignment: 'RIGHT' })

  // Las dos filas que se leen primero. El saldo final lleva el único acento del cuadro.
  celdas(f.resultado, 0, meta.footprint.cols, 'userEnteredFormat.textFormat', { textFormat: txt(INK, { bold: true, size: 10 }) })
  reglaFina(f.resultado, 'top')
  celdas(f.saldoFinal, 0, meta.footprint.cols, 'userEnteredFormat.textFormat', { textFormat: txt(ACENTO, { bold: true, size: 10 }) })
  celdas(f.saldoFinal, col0, colUltima + 1, 'userEnteredFormat(textFormat,numberFormat)',
    { textFormat: txt(ACENTO, { bold: true, size: 10 }), numberFormat: MONEDA_TOTAL })
}

/**
 * NÚCLEO PURO: las reglas condicionales de una matriz.
 *
 * Cuatro preguntas, y ninguna más: ¿el saldo se va abajo de cero? ¿queda por debajo del piso? ¿el
 * período consume caja? ¿el desvío es negativo? Cada una es una regla sobre la FILA entera.
 *
 * @param {object} p
 * @param {number} p.sheetId
 * @param {object} p.meta
 * @param {string|null} p.refMinima rango con nombre de la caja mínima; sin él, sólo se marca el déficit
 */
export function reglasCondicionales({ sheetId, meta, refMinima = null }) {
  // ═══ EL RANGO CON NOMBRE VA ENVUELTO EN INDIRECT ═══
  //
  // La API rechaza `N(CAJA_MINIMA)` dentro de una CUSTOM_FORMULA con 400 INVALID_ARGUMENT: las
  // fórmulas de formato condicional NO aceptan rangos con nombre — limitación de Sheets, no de este
  // código. `INDIRECT("nombre")` sí resuelve, y sigue el nombre si la celda se mueve.
  const porNombre = refMinima ? `INDIRECT("${refMinima}")` : null
  const f = meta.fila
  const c0 = meta.cab.col0
  const c1 = meta.cab.colTotal + 1
  const letraCol = (i) => String.fromCharCode(65 + i) // las matrices no pasan de la columna N
  const req = []
  const regla = (filaN, formula, color, bold) => req.push({
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId, startRowIndex: filaN - 1, endRowIndex: filaN, startColumnIndex: c0, endColumnIndex: c1 }],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] },
          format: { textFormat: { foregroundColor: color, bold } },
        },
      },
      index: 0,
    },
  })
  /** La celda de referencia de una regla: columna RELATIVA (corre con el rango), fila FIJA. */
  const ref = (filaN) => `${letraCol(c0)}$${filaN}`

  // El orden importa: la primera regla que da verdadera gana. El déficit va primero porque un saldo
  // negativo también está por debajo del piso, y lo que hay que ver es que está bajo cero.
  regla(f.saldoFinal, `=N(${ref(f.saldoFinal)})<0`, DEFICIT, true)
  if (refMinima) {
    // `<>""` no es cosmético: un mes anterior al corte va VACÍO, y `N("")` vale 0 — sin esa guarda la
    // regla del piso pintaría de ámbar todas las celdas vacías del cuadro.
    regla(f.saldoFinal, `=AND(${ref(f.saldoFinal)}<>"";N(${ref(f.saldoFinal)})>=0;N(${ref(f.saldoFinal)})<N(${porNombre}))`, AVISO, true)
  }
  regla(f.resultado, `=N(${ref(f.resultado)})<0`, TINTE, false)
  for (const clave of ['variacionPresupuesto', 'variacionMesAnterior']) {
    if (f[clave]) regla(f[clave], `=N(${ref(f[clave])})<0`, TINTE, false)
  }
  return req
}

/** Los requests para borrar TODAS las reglas condicionales de una pestaña, de atrás para adelante. */
export function borrarCondicionales(sheetId, cantidad = 0) {
  const req = []
  for (let i = cantidad - 1; i >= 0; i--) req.push({ deleteConditionalFormatRule: { sheetId, index: i } })
  return req
}

/**
 * Los requests para ACHICAR la hoja al footprint declarado. Devuelve [] si ya está en medida.
 *
 * ═══ POR QUÉ SE BORRA Y NO SE DEJA ═══
 *
 * Las dos pestañas venían de 220×65 con 86 filas muertas y quince columnas ocultas de maquinaria. La
 * escritura sólo limpia el rectángulo que declara suyo: todo lo de afuera se queda con la mitad
 * derecha del diseño anterior, para siempre, y `auditar-pantalla` lo sigue midiendo.
 *
 * ES SEGURO PORQUE LA PROTECCIÓN NO ES ÉSTA: si el dueño editó cualquier celda de la pestaña, la
 * FIRMA lo detecta y la escritura no ocurre (escribirPreservando aborta antes de tocar nada). Esto
 * sólo corre después de una escritura que ya tuvo permiso, y por eso el generador lo llama DESPUÉS.
 */
export function achicarHoja(sheetId, { filas = 0, cols = 0 }, footprint) {
  const req = []
  if (filas > footprint.filas) {
    req.push({ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: footprint.filas, endIndex: filas } } })
  }
  if (cols > footprint.cols) {
    req.push({ deleteDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: footprint.cols, endIndex: cols } } })
  }
  return req
}
