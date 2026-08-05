// LA PIEL DE LOS DOS CASH FLOW — el estado de flujo de efectivo como lo imprimiría un banco.
//
// POR QUÉ EXISTE (04/08). El dueño, por segunda vez, sobre estas mismas pestañas: "cada pestaña tiene
// que quedar minimalista y de clase mundial". Las dos venían formateadas con el lenguaje contrario:
// barras azules rellenas para cada actividad, una barra gris para cada categoría, un rectángulo verde
// bajo el efectivo al cierre, el "$" repetido en las 636 celdas del cuerpo y el negativo dibujado con
// un guion rojo. Eso es una planilla pintada, no un statement.
//
// LO QUE DICE LA NORMA Y LO QUE DICE EL OJO, que acá coinciden:
//
//   · EL NEGATIVO VA ENTRE PARÉNTESIS (AICPA/FASB bajo US GAAP, endosado por IFRS, exigido por la SEC
//     en las presentaciones de sociedades). Un guion chico se confunde con una marca de impresión.
//     Reusa formato-statement.mjs: acá no se redefine ningún patrón de número.
//   · EL "$" ES DEL CIERRE. En el cuerpo estorba; en la columna del total y en las filas de saldo
//     declara la unidad una sola vez. Y de paso resuelve, sin dibujar una línea vertical, el problema
//     de que "Total 2026" se leía como un mes más: es la única columna del cuadro con símbolo.
//   · LA JERARQUÍA SE HACE CON TIPOGRAFÍA Y UNA REGLA FINA, NO CON RELLENO. Actividad en tinta y
//     cuerpo mayor; categoría en negrita; detalle sangrado y apagado; subtotal con la regla ENCIMA.
//   · EL EFECTIVO AL CIERRE ES EL ANCLA. Es la fila que contesta qué día la caja no alcanza, y es la
//     única con regla arriba Y abajo — la doble raya del total general de un estado financiero.
//   · LO PROYECTADO EN ITÁLICA, NUNCA EN FONDO DE COLOR. Un rectángulo de color dice "mirá acá"; la
//     itálica dice "esto todavía no pasó", que es lo que hay que decir. Se recalcula en cada corrida
//     contra la fecha de hoy: ninguna columna hereda su formato de la corrida anterior.
//
// NO HAY BORDES VERTICALES NI CAJAS. Una regla existe para separar contenido en UNA dirección.

import { MONEDA_CUERPO, MONEDA_TOTAL, CONTADOR, PORCENTAJE, MONEDA_CONTROL } from './formato-statement.mjs'
import { INK, MUTED, HAIR, ACENTO, BLANCO } from './estilo-statement.mjs'

const FUENTE = 'Arial'
const txt = (color, { bold = false, size = 9, italic = false } = {}) =>
  ({ foregroundColor: color, bold, italic, fontSize: size, fontFamily: FUENTE })

/** El detalle, apagado contra la tinta de los subtotales: se lee como respaldo, no como titular. */
const TENUE = { red: 0.36, green: 0.38, blue: 0.42 }

/**
 * QUÉ COLUMNAS SON PROYECCIÓN Y CUÁLES YA PASARON.
 *
 * Una columna de período es proyección cuando su ventana TERMINA después de hoy: la semana en curso y
 * el mes en curso son mixtos (parte real, parte por venir), y mostrarlos como hecho consumado es
 * exactamente el error que la regla de oro 2 prohíbe. Por eso el corte es el FIN de la ventana y no su
 * comienzo — el mes de hoy también sale en itálica.
 *
 * @param {'semanal'|'mensual'} periodo
 * @param {Date[]} fechas encabezado de cada columna de período (lunes, o primero de mes)
 * @param {Date} hoy
 * @returns {Set<number>} índices 0-based dentro de las columnas de período
 */
export function columnasProyectadas(periodo, fechas, hoy) {
  const out = new Set()
  const t = hoy.getTime()
  fechas.forEach((d, i) => {
    const fin = periodo === 'semanal'
      ? new Date(d.getTime() + 7 * 86400000)
      : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    if (fin.getTime() > t) out.add(i)
  })
  return out
}

/**
 * LOS REQUESTS DE FORMATO DEL CUADRO. Función pura: no toca la red, así que se puede probar entera.
 *
 * @param {object} p
 * @param {number} p.sheetId
 * @param {object} p.meta el `meta` que devolvió grilla(): actividades, grupos, subtotales, variacion,
 *   inicio, cierre, detalle, cabFila
 * @param {number} p.n cantidad de columnas de PERÍODO (52/53 semanas o 12 meses)
 * @param {number} p.ancho ancho total del rectángulo escrito, en columnas
 * @param {number} p.nFilas alto total del rectángulo escrito
 * @param {number} p.filaRef primera fila del bloque "dónde está el detalle"
 * @param {number} p.filaCtrl primera fila del bloque de control
 * @param {number} p.filaCtrlFin última fila del bloque de control
 * @param {'semanal'|'mensual'} p.periodo
 * @param {Date[]} p.fechas
 * @param {Date} p.hoy
 * @param {number} [p.filasHoja] alto de la hoja, para limpiar debajo de lo escrito
 * @param {number} [p.colsHoja] ancho de la hoja, idem
 */
export function pielCashFlow({
  sheetId, meta, n, ancho, nFilas, filaRef, filaCtrl, filaCtrlFin,
  periodo, fechas, hoy, filasHoja = 0, colsHoja = 0, extras = [],
}) {
  const req = []
  // UNA GUARDA, NO UNA CONFIANZA: un rango de alto o ancho cero devuelve 400 y tumba el lote entero,
  // dejando la pestaña escrita a medias. Ya pasó con esta misma pestaña.
  const rango = (r0, r1, c0, c1) => (r1 > r0 && c1 > c0
    ? { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 }
    : null)
  const push = (r, fields, format) => { if (r) req.push({ repeatCell: { range: r, cell: { userEnteredFormat: format }, fields } }) }
  const fila = (f, fields, format, c0 = 0, c1 = ancho) => push(rango(f - 1, f, c0, c1), fields, format)
  // Una regla se dibuja del ancho del CUADRO, nunca de la hoja: donde no hay contenido no hay regla.
  const regla = (f, lado) => { const r = rango(f - 1, f, 0, ancho); if (r) req.push({ updateBorders: { range: r, [lado]: { style: 'SOLID', width: 1, color: HAIR } } }) }

  const colTotal = n + 1                 // 0-based: A(0) + n períodos → la del total
  const primeraFila = meta.cabFila + 1   // el cuerpo arranca después del encabezado

  // ── 1. La hoja: sin reja, con el encabezado y los rótulos anclados ──────────────────────────────
  req.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { hideGridlines: true, frozenRowCount: 3, frozenColumnCount: 1 } },
      fields: 'gridProperties(hideGridlines,frozenRowCount,frozenColumnCount)',
    },
  })
  // Todo el rectángulo arranca parejo: fondo blanco y cuerpo de texto base. Sin este reset, la
  // itálica o la negrita de la corrida anterior aterriza sobre una fila que ahora es otra cosa.
  push(rango(0, Math.max(nFilas, filasHoja), 0, Math.max(ancho, colsHoja)),
    'userEnteredFormat(backgroundColor,textFormat)',
    { backgroundColor: BLANCO, textFormat: txt(INK, { size: 9 }) })
  {
    const r = rango(0, Math.max(nFilas, filasHoja), 0, Math.max(ancho, colsHoja))
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

  // ── 2. Los números ──────────────────────────────────────────────────────────────────────────────
  // Cuerpo: sin "$", negativo entre paréntesis, cero en raya.
  push(rango(primeraFila - 1, nFilas, 1, colTotal), 'userEnteredFormat(numberFormat,horizontalAlignment)',
    { numberFormat: MONEDA_CUERPO, horizontalAlignment: 'RIGHT' })
  // La columna de cierre del año declara la unidad: es lo único que la separa visualmente de un mes,
  // y no hace falta ninguna línea vertical para lograrlo.
  push(rango(primeraFila - 1, nFilas, colTotal, colTotal + 1), 'userEnteredFormat(numberFormat,horizontalAlignment)',
    { numberFormat: MONEDA_TOTAL, horizontalAlignment: 'RIGHT' })
  // Las columnas de conciliación del mensual (Real / Proyectado) son importes, no períodos.
  if (ancho > colTotal + 1) {
    push(rango(primeraFila - 1, nFilas, colTotal + 1, Math.min(colTotal + 3, ancho)),
      'userEnteredFormat(numberFormat,horizontalAlignment)',
      { numberFormat: MONEDA_CUERPO, horizontalAlignment: 'RIGHT' })
  }
  // "De dónde sale la proyección" es una explicación, no plata.
  if (ancho > colTotal + 3) {
    push(rango(primeraFila - 1, nFilas, colTotal + 3, ancho), 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment,wrapStrategy)',
      { numberFormat: { type: 'TEXT' }, textFormat: txt(MUTED, { size: 9, italic: true }), horizontalAlignment: 'LEFT', wrapStrategy: 'CLIP' })
  }

  // ── 3. Título, subtítulo y encabezado de períodos ───────────────────────────────────────────────
  fila(1, 'userEnteredFormat(textFormat,horizontalAlignment)',
    { textFormat: txt(INK, { bold: true, size: 15 }), horizontalAlignment: 'LEFT' })
  fila(2, 'userEnteredFormat(textFormat,horizontalAlignment)',
    { textFormat: txt(MUTED, { size: 9 }), horizontalAlignment: 'LEFT' })
  // El encabezado de períodos: versalita apagada y una regla fina abajo. Sin barra rellena.
  fila(meta.cabFila, 'userEnteredFormat(textFormat,horizontalAlignment,numberFormat)',
    {
      textFormat: txt(MUTED, { bold: true, size: 9 }),
      horizontalAlignment: 'CENTER',
      numberFormat: { type: 'DATE', pattern: periodo === 'mensual' ? 'mmm-yy' : 'dd/mm' },
    })
  push(rango(meta.cabFila - 1, meta.cabFila, 0, 1), 'userEnteredFormat.horizontalAlignment', { horizontalAlignment: 'LEFT' })
  // Los encabezados que NO son un período no llevan formato de fecha, o Sheets los dibuja como una.
  push(rango(meta.cabFila - 1, meta.cabFila, colTotal, ancho), 'userEnteredFormat(numberFormat,textFormat)',
    { numberFormat: { type: 'TEXT' }, textFormat: txt(INK, { bold: true, size: 9 }) })
  if (ancho > colTotal + 1) {
    push(rango(meta.cabFila - 1, meta.cabFila, colTotal + 1, ancho), 'userEnteredFormat.textFormat',
      { textFormat: txt(MUTED, { bold: true, size: 9, italic: true }) })
  }
  regla(meta.cabFila, 'bottom')

  // ── 4. La jerarquía contable, con tipografía ────────────────────────────────────────────────────
  for (const r of meta.actividades) {
    fila(r, 'userEnteredFormat(textFormat,horizontalAlignment)',
      { textFormat: txt(INK, { bold: true, size: 11 }), horizontalAlignment: 'LEFT' })
    regla(r, 'top')
  }
  for (const gr of meta.grupos) {
    fila(gr.fila0 - 1, 'userEnteredFormat.textFormat', { textFormat: txt(INK, { bold: true, size: 9 }) })
    push(rango(gr.fila0 - 1, gr.fila1, 0, ancho), 'userEnteredFormat.textFormat', { textFormat: txt(TENUE, { size: 9 }) })
  }
  for (const r of [...meta.subtotales, meta.variacion]) {
    fila(r, 'userEnteredFormat.textFormat', { textFormat: txt(INK, { bold: true, size: 10 }) })
    push(rango(r - 1, r, 1, ancho), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_TOTAL })
    regla(r, 'top')
  }
  // El saldo con el que arranca el período: es un saldo, no un flujo — lleva "$" como el cierre.
  fila(meta.inicio, 'userEnteredFormat.textFormat', { textFormat: txt(INK, { size: 9 }) })
  push(rango(meta.inicio - 1, meta.inicio, 1, ancho), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_TOTAL })
  // ═══ EL ANCLA DEL CUADRO ═══
  // La única fila con regla ARRIBA y ABAJO: la doble raya con la que un estado financiero cierra su
  // total general. Antes esto era un rectángulo verde, que dice "acá hay algo lindo" en vez de "acá
  // termina la cuenta".
  fila(meta.cierre, 'userEnteredFormat(textFormat,numberFormat)',
    { textFormat: txt(ACENTO, { bold: true, size: 11 }), numberFormat: MONEDA_TOTAL })
  push(rango(meta.cierre - 1, meta.cierre, 0, 1), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
  regla(meta.cierre, 'top')
  regla(meta.cierre, 'bottom')

  // ── 5. Lo proyectado, en itálica ────────────────────────────────────────────────────────────────
  // Sólo el campo `italic` del textFormat, para no borrar la negrita de los subtotales que ya se puso.
  const proy = columnasProyectadas(periodo, fechas, hoy)
  for (const i of proy) {
    push(rango(primeraFila - 1, meta.cierre, i + 1, i + 2), 'userEnteredFormat.textFormat.italic', { textFormat: { italic: true } })
  }

  // ── 6. Los bloques de texto del pie ─────────────────────────────────────────────────────────────
  // Referencias y control son texto y no plata: el formato moneda del cuerpo los dibujaba como importes.
  push(rango(filaRef - 1, nFilas, 1, ancho), 'userEnteredFormat(numberFormat,horizontalAlignment,textFormat)',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: txt(MUTED, { size: 9 }) })
  fila(filaRef, 'userEnteredFormat.textFormat', { textFormat: txt(INK, { bold: true, size: 11 }) })
  regla(filaRef, 'top')
  fila(filaCtrl - 1, 'userEnteredFormat.textFormat', { textFormat: txt(INK, { bold: true, size: 11 }) })
  regla(filaCtrl - 1, 'top')
  push(rango(filaCtrl - 1, filaCtrlFin, 1, 2), 'userEnteredFormat(numberFormat,horizontalAlignment)',
    { numberFormat: MONEDA_TOTAL, horizontalAlignment: 'RIGHT' })

  // ── 6 bis. LOS BLOQUES DE DECISIÓN, COMPOSICIÓN Y CONTRASTE ─────────────────────────────────────
  //
  // Van AL FINAL a propósito: pisan lo que el cuerpo pintó encima de sus filas. Sin esto, una
  // cobertura de obligaciones del 87% se dibuja como "$1" (el formato de moneda del cuerpo redondea
  // 0,87 a 1 y le pone el símbolo) y un contador de semanas negativas se lee como plata. Es el mismo
  // defecto que el auditor de pantalla llama "texto_en_numero", del otro lado.
  const PATRON = {
    moneda: MONEDA_TOTAL, porcentaje: PORCENTAJE, entero: CONTADOR, control: MONEDA_CONTROL,
    fecha: { type: 'DATE', pattern: 'dd/mm/yyyy' }, texto: { type: 'TEXT' },
  }
  for (const e of extras) {
    if (e.tipo === 'titulo') {
      fila(e.f, 'userEnteredFormat(textFormat,numberFormat,horizontalAlignment)',
        { textFormat: txt(INK, { bold: true, size: 11 }), numberFormat: PATRON.texto, horizontalAlignment: 'LEFT' })
      regla(e.f, 'top')
      continue
    }
    push(rango(e.f - 1, e.f, e.c0, e.c1), 'userEnteredFormat(numberFormat,horizontalAlignment)',
      { numberFormat: PATRON[e.tipo] ?? PATRON.texto, horizontalAlignment: e.tipo === 'texto' ? 'LEFT' : 'RIGHT' })
  }

  // ── 7. Anchos ───────────────────────────────────────────────────────────────────────────────────
  // La columna A llevaba 260 px y cortaba a la mitad los rótulos largos ("La misma nómina de
  // administración, según Compr…"). Un rótulo cortado no es un rótulo.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 340 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: ancho }, properties: { pixelSize: 96 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: Math.max(nFilas, filasHoja) }, properties: { pixelSize: 21 }, fields: 'pixelSize' } })

  return req
}
