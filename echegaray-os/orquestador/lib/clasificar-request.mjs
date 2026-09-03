// QUÉ PUEDE DESTRUIR CADA REQUEST DE LA SHEETS API — la tabla que le faltaba a la guarda del batch.
//
// POR QUÉ (03/08). La guarda del batch estructural clasificaba como "contenido" sólo a los requests que
// ESCRIBEN una celda (updateCells con valor, copyPaste/pasteData/appendCells). Todo lo demás —"el formato
// y la estructura pasan siempre", decía su propio comentario— cruzaba sin control. Entre ese "todo lo
// demás" estaba `deleteDimension`: borrar filas o columnas enteras, la operación más destructiva que
// existe sobre una planilla. La guarda frenaba escribir una fórmula en una celda candada y dejaba pasar
// borrarle quince filas: frenaba el riesgo chico y dejaba pasar el grande.
//
// CÓMO MORDIÓ, dos veces el mismo día contra el Sheet real:
//  · "Jornales por Quincena": el borrado de 15 filas pasó sin control, cambió la firma de la pestaña, eso
//    la AUTO-CANDÓ, y la escritura que COMPLETABA el trabajo quedó bloqueada. La pestaña a medio camino.
//  · "Impuestos y Financieros": borrada la sección duplicada, la pestaña se auto-candó por el propio
//    borrado, y las filas que dependían de lo borrado quedaron en #REF! sin poder repararlas.
// El patrón es el peor posible: la guarda te deja ROMPER una pestaña y no te deja ARREGLARLA. Y como el
// borrado dispara el auto-candado, el daño se auto-blinda.
//
// LA REGLA NUEVA, INVERTIDA. La lista blanca ya no es de lo que se frena sino de lo que PASA: un request
// es INOCUO sólo si está enumerado acá abajo, con su porqué escrito. Cualquier otro —conocido y
// destructivo, o desconocido— pasa por la guarda. Un tipo de request nuevo de la API de Google entra por
// el lado seguro sin que nadie tenga que acordarse de agregarlo, que es justo el olvido que produjo esto.
//
// LA ATRIBUCIÓN, también del lado seguro. De un request destructivo se cosechan TODOS los sheetId que
// menciona, no uno: `cutPaste` VACÍA el origen además de pisar el destino, y clasificarlo sólo por el
// destino dejaba el origen sin proteger. Si no menciona ninguno —`findReplace{allSheets:true}`,
// `deleteEmbeddedObject`, un tipo que no conocemos— no se lo puede atribuir a una pestaña: se lo trata
// como si le pegara a TODAS.

export const CLASE = {
  DESTRUCTIVO: 'destructivo', // borra, pisa, desplaza o reordena contenido → pasa por la guarda
  INOCUO: 'inocuo',           // apariencia, vista o estructura que sólo agrega → pasa libre
}

/**
 * ¿La máscara `fields` de un updateCells/repeatCell toca CONTENIDO y no sólo formato?
 *
 * Contenido = todo lo que puede pisar lo que dejó una persona en la celda: su VALOR, su NOTA
 * (RESPETO-NOTAS, 27/07: una nota vive fuera del valor, así que sólo un `fields:'note'` la borra) o una
 * TABLA DINÁMICA (que además derrama sobre las celdas de al lado). Sin máscara no se puede AFIRMAR que
 * sea sólo formato → cuenta como contenido.
 */
export function fieldsTocanContenido(fields) {
  const f = String(fields ?? '')
  if (!f || f === '*') return true
  // \b evita que un campo que contenga la palabra como subcadena (p.ej. `footnotes`) se cuele.
  return /userEnteredValue|\bnote\b|pivotTable|dataSource/.test(f)
}

/**
 * Qué dimensiones del TAMAÑO de la grilla toca una máscara `fields` de updateSheetProperties. Achicar
 * `rowCount` borra de verdad las filas que quedan afuera —es un deleteDimension con otro nombre—, así
 * que esta es la única propiedad de pestaña que no puede pasar libre.
 */
export function tamanoQueToca(fields) {
  const f = String(fields ?? '')
  // Máscara ANCHA (vacía, `*`, o `gridProperties` a secas): cubre el tamaño entero, y lo que la máscara
  // cubre pero no se declara se BORRA. Se la trata como si tocara las dos dimensiones.
  const ancha = !f || f === '*' || /(^|[,\s])gridProperties([,\s]|$)/.test(f)
  // Ojo con `frozenRowCount`: contiene "RowCount" con mayúscula, así que /\browCount\b/ no lo agarra —
  // congelar filas es apariencia y tiene que seguir pasando libre.
  return { filas: ancha || /\browCount\b/.test(f), columnas: ancha || /\bcolumnCount\b/.test(f) }
}

// Las claves que llevan el PAYLOAD (la grilla de celdas) no se recorren: no contienen locators y pueden
// tener miles de filas. Los locators —range, source, destination, coordinate, properties— son chicos.
const CLAVES_PAYLOAD = new Set(['rows', 'values', 'cell', 'data'])

/** Todos los sheetId que un request menciona, mire donde mire. Puro. */
export function sheetIdsMencionados(nodo, out = new Set(), prof = 0) {
  if (!nodo || typeof nodo !== 'object' || prof > 6) return out
  if (Array.isArray(nodo)) { for (const x of nodo) sheetIdsMencionados(x, out, prof + 1); return out }
  for (const [k, v] of Object.entries(nodo)) {
    if (CLAVES_PAYLOAD.has(k)) continue
    if (k === 'sheetId' && Number.isInteger(v)) { out.add(v); continue }
    sheetIdsMencionados(v, out, prof + 1)
  }
  return out
}

/**
 * LA LISTA BLANCA. Cada entrada es una afirmación verificable: "este request no puede borrar, pisar ni
 * desplazar una celda que ya existe". Lo que no está acá pasa por la guarda.
 *
 * Los ausentes notorios y por qué NO están:
 *  · `mergeCells`: combinar un rango con datos DESCARTA el valor de todas las celdas menos la ancla.
 *    `unmergeCells` sí está: descombinar devuelve el valor a la ancla y no borra nada.
 *  · `deleteNamedRange` / `deleteProtectedRange` / `deleteDeveloperMetadata`: deshacen algo que declaró
 *    el dueño (un nombre del que cuelgan fórmulas, una protección) y no traen sheetId para atribuirlos.
 *  · `deleteEmbeddedObject`: borra un gráfico o una imagen suya y sólo trae `objectId`.
 */
const INOCUOS = new Map([
  // ── FORMATO PURO: cambia cómo se ve una celda, nunca lo que dice ──
  ['updateBorders', 'bordes'],
  ['unmergeCells', 'descombina: el valor vuelve a su celda, no se pierde ninguno'],
  ['updateDimensionProperties', 'ancho, alto y visibilidad de filas y columnas'],
  ['autoResizeDimensions', 'ajusta el ancho al contenido'],
  ['addBanding', 'colores alternados'],
  ['updateBanding', 'colores alternados'],
  ['deleteBanding', 'colores alternados'],
  ['addConditionalFormatRule', 'formato condicional'],
  ['updateConditionalFormatRule', 'formato condicional'],
  ['deleteConditionalFormatRule', 'formato condicional'],
  ['setDataValidation', 'reglas de validación: no reescriben lo que ya está cargado'],
  // ── VISTA: cambia lo que se muestra, no lo que hay ──
  ['setBasicFilter', 'filtro'],
  ['clearBasicFilter', 'filtro'],
  ['addFilterView', 'vista de filtro'],
  ['updateFilterView', 'vista de filtro'],
  ['deleteFilterView', 'vista de filtro'],
  ['duplicateFilterView', 'vista de filtro'],
  ['addDimensionGroup', 'agrupación +/- del margen'],
  ['updateDimensionGroup', 'agrupación +/- del margen'],
  ['deleteDimensionGroup', 'agrupación +/- del margen'],
  // ── ESTRUCTURA QUE SÓLO AGREGA: no desplaza ni pisa nada que ya exista ──
  ['addSheet', 'crea una pestaña nueva'],
  ['duplicateSheet', 'crea una copia; el original queda intacto'],
  ['appendDimension', 'agrega filas/columnas AL FINAL: no desplaza lo de arriba'],
  ['addNamedRange', 'le pone nombre a un rango'],
  ['updateNamedRange', 'reapunta un nombre existente'],
  // ── OBJETOS FLOTANTES: viven sobre la grilla, no en las celdas ──
  ['addChart', 'gráfico'],
  ['updateChartSpec', 'gráfico'],
  ['updateEmbeddedObjectPosition', 'objeto flotante'],
  ['updateEmbeddedObjectBorder', 'objeto flotante'],
  ['addSlicer', 'control de segmentación'],
  ['updateSlicerSpec', 'control de segmentación'],
  // ── ARCHIVO ──
  ['updateSpreadsheetProperties', 'propiedades del archivo (locale, recálculo)'],
])

/**
 * Clasifica UN request de la Sheets API.
 *
 * @param {object} req request de la API
 * @param {Map<number,{rows:number, cols:number}>} [dims] tamaño actual de cada pestaña (getSheetMeta).
 *        Sólo hace falta para decidir si un `updateSheetProperties` AGRANDA la grilla (inocuo) o la
 *        ACHICA (destructivo). Sin él no se puede afirmar cuál de las dos es → destructivo.
 * @returns {{clase:string, sheetIds:number[], todas:boolean, porQue:string}} `todas` = destructivo que no
 *          se pudo atribuir a ninguna pestaña, así que se lo trata como si le pegara a todas.
 */
export function clasificarRequest(req, dims = null) {
  const inocuo = (porQue) => ({ clase: CLASE.INOCUO, sheetIds: [], todas: false, porQue })
  const destructivo = (porQue) => {
    const sheetIds = [...sheetIdsMencionados(req)]
    return { clase: CLASE.DESTRUCTIVO, sheetIds, todas: sheetIds.length === 0, porQue }
  }
  if (!req || typeof req !== 'object' || Array.isArray(req)) return inocuo('no es un request: no hay nada que mandar')
  const tipos = Object.keys(req)
  // Un request de la API tiene exactamente un tipo. Con dos no se sabe cuál va a interpretar Google.
  if (tipos.length !== 1) return destructivo(`request con ${tipos.length} tipos: no sé cuál se aplica`)
  const tipo = tipos[0]

  if (tipo === 'updateCells' || tipo === 'repeatCell') {
    const f = req[tipo].fields
    return fieldsTocanContenido(f)
      ? destructivo(`${tipo} escribe contenido (fields: ${f || 'sin máscara'})`)
      : inocuo(`${tipo} sólo de formato (fields: ${f})`)
  }
  if (tipo === 'copyPaste') {
    const pt = String(req.copyPaste.pasteType ?? 'PASTE_NORMAL')
    return /^PASTE_(FORMAT|DATA_VALIDATION|CONDITIONAL_FORMATTING)$/.test(pt)
      ? inocuo(`copyPaste ${pt}: no pisa el valor del destino`)
      : destructivo(`copyPaste ${pt} pisa el destino`)
  }
  if (tipo === 'updateSheetProperties') {
    const p = req.updateSheetProperties || {}
    const toca = tamanoQueToca(p.fields)
    if (!toca.filas && !toca.columnas) return inocuo('updateSheetProperties de apariencia (título, color, filas congeladas)')
    const actual = dims?.get?.(p.properties?.sheetId)
    if (!actual) return { ...destructivo('cambia el tamaño de la grilla y no sé el tamaño actual: achicarla borra las filas de abajo'), borraContenido: true }
    const g = p.properties?.gridProperties || {}
    // Sólo pasa el caso que se puede AFIRMAR inofensivo: el tamaño nuevo declarado es mayor o igual al
    // actual en cada dimensión que la máscara toca.
    const crece = (declarado, hoy) => Number.isInteger(declarado) && declarado >= (hoy ?? 0)
    const okFilas = !toca.filas || crece(g.rowCount, actual.rows)
    const okCols = !toca.columnas || crece(g.columnCount, actual.cols)
    return okFilas && okCols
      ? inocuo('agranda la grilla: no deja ninguna fila afuera')
      // BORRA CONTENIDO: no alcanza con marcarlo destructivo. Un destructivo sólo se frena sobre
      // pestañas CANDADAS a mano, y la firma automática está apagada por orden del dueño desde el
      // 05/08 — o sea que sobre casi todas las pestañas «destructivo» no frena nada. Achicar la
      // grilla es la única propiedad de pestaña que borra celdas con lo que tengan, igual que un
      // `deleteDimension`, así que se marca aparte para poder frenarlo SIEMPRE.
      : { ...destructivo('achica la grilla: las filas o columnas que quedan afuera se borran con lo que tengan'), borraContenido: true }
  }
  const porQueInocuo = INOCUOS.get(tipo)
  if (porQueInocuo) return inocuo(`${tipo}: ${porQueInocuo}`)
  return destructivo(`${tipo}: no está en la lista de lo que se puede afirmar inofensivo`)
}
