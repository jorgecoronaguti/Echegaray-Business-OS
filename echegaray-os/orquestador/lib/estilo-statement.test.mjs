import test from 'node:test'
import assert from 'node:assert/strict'
import { skinRequests, conContenido, ES_TOTAL, ES_SECCION, ES_ENCABEZADO } from './estilo-statement.mjs'
import { VACIO } from './preservar-anotaciones.mjs'

/** Una fila como la emite un generador: lo escrito, y el resto del ancho declarado como propio. */
const conCentinela = (celdas, ancho = 6) => {
  const f = [...celdas]
  while (f.length < ancho) f.push(VACIO)
  return f
}

test('EL CENTINELA DE CELDA VACÍA NO ES CONTENIDO', () => {
  // ═══ EL DEFECTO QUE ESTE TEST ATRAPA (06/08) ═══
  //
  // `VACIO` vale una cadena NO vacía, y los generadores rellenan con él todo el ancho que poseen. Una
  // comparación ingenua (`String(x).trim()`) lo lee como contenido, y de ahí salían dos defectos que
  // no se ven en ningún valor de celda: ningún título de sección recibía su tipografía (quedaban en
  // 10 pt regular, iguales a un renglón de datos) y toda regla se dibujaba del ancho de la HOJA en vez
  // del ancho del bloque. Los dos estaban vivos en "Impuestos y Financieros", medidos sobre el Sheet.
  assert.equal(conContenido(VACIO), false)
  assert.equal(conContenido(''), false)
  assert.equal(conContenido('   '), false)
  assert.equal(conContenido(null), false)
  assert.equal(conContenido(0), true, 'un cero es un importe, no una celda vacía')
  assert.equal(conContenido('x'), true)
})

test('un título de sección rodeado de centinelas SIGUE siendo un título', () => {
  const filas = [
    conCentinela(['Cargas sociales']),
    conCentinela(['de dónde sale']),
    conCentinela(['1 · DECLARADO']),
    conCentinela(['Concepto', 'ene']),
    conCentinela(['L.R.T. — ART', 1141733]),
  ]
  const reqs = skinRequests({ sheetId: 1, filas, cols: 6 })
  const titulo = reqs.find((r) => r.repeatCell?.range?.startRowIndex === 2
    && r.repeatCell?.cell?.userEnteredFormat?.textFormat?.fontSize === 11)
  assert.ok(titulo, 'la sección tiene que quedar en 11 pt negrita, no en cuerpo de tabla')
  // Y su regla llega hasta donde llega el bloque (dos columnas), no hasta la seis.
  const regla = reqs.find((r) => r.updateBorders && r.updateBorders.range.startRowIndex === 2)
  assert.equal(regla.updateBorders.range.endColumnIndex, 2)
})

test('la columna A se devuelve a la izquierda: el reset no llegaba a la alineación', () => {
  // 43 filas de "Impuestos y Financieros" habían quedado CENTER de un layout anterior. En una columna
  // de 360 px un título centrado desborda hacia los dos lados y la hoja le corta el izquierdo: cinco
  // títulos de sección se leían empezados por la mitad.
  const reqs = skinRequests({ sheetId: 1, filas: [['T'], ['n'], ['x', 1]], cols: 3, filasHoja: 40 })
  const reset = reqs.find((r) => r.repeatCell?.fields === 'userEnteredFormat.horizontalAlignment')
  assert.ok(reset, 'hay un reset de alineación')
  assert.equal(reset.repeatCell.cell.userEnteredFormat.horizontalAlignment, 'LEFT')
  assert.equal(reset.repeatCell.range.startColumnIndex, 0)
  assert.equal(reset.repeatCell.range.endColumnIndex, 1, 'sólo la columna del concepto')
  assert.equal(reset.repeatCell.range.endRowIndex, 40, 'hasta el final de la hoja, no de la grilla')
})

test('detecta secciones, encabezados y totales por el contenido de la columna A', () => {
  assert.ok(ES_SECCION.test('1. IVA REAL DE ARCA'))
  assert.ok(ES_SECCION.test('2. INGRESOS BRUTOS (San Juan) — de las DDJJ reales de Rentas'))
  assert.ok(ES_ENCABEZADO.test('Período'))
  assert.ok(ES_ENCABEZADO.test('Concepto'))
  assert.ok(ES_ENCABEZADO.test('Proveedor'))
  assert.ok(ES_TOTAL.test('TOTAL 2026'))
  assert.ok(ES_TOTAL.test('⇒ Control contra Compras'))
  // Un total no se confunde con una sección aunque esté en mayúsculas.
  assert.ok(ES_TOTAL.test('TOTAL PLANES') && ES_TOTAL.test('TOTAL PLANES'))
  // Una fila de dato normal no es ninguna de las tres.
  assert.ok(!ES_SECCION.test('Combustibles Barcelo') && !ES_ENCABEZADO.test('Combustibles Barcelo') && !ES_TOTAL.test('Combustibles Barcelo'))
})

test('skinRequests apaga la reja y pinta todo de blanco antes de rular', () => {
  const filas = [['Impuestos y Financieros'], ['1. IVA REAL'], ['Período', 'Base'], ['ene-26', 100], ['TOTAL', 100]]
  const reqs = skinRequests({ sheetId: 7, filas, cols: 2, congeladas: 1 })
  const props = reqs.find((r) => r.updateSheetProperties)
  assert.equal(props.updateSheetProperties.properties.gridProperties.hideGridlines, true)
  assert.equal(props.updateSheetProperties.properties.gridProperties.frozenRowCount, 1)
  // La primera es apagar reja, la segunda pintar de blanco toda la grilla.
  assert.ok(reqs[1].repeatCell.cell.userEnteredFormat.backgroundColor.red === 1)
  // Hay al menos un borde (hairline) para el total y para la sección.
  assert.ok(reqs.some((r) => r.updateBorders?.top) )
})

test('un rótulo en versalita con importes al lado es un dato, no un título de sección', () => {
  const filas = [['Cargas sociales'], ['de dónde sale'], ['1 · DECLARADO'], ['Concepto', 'ene'],
    ['L.R.T. — ART', 1141733], ['⇒ Total declarado', 4582692]]
  const reqs = skinRequests({ sheetId: 1, filas, cols: 2 })
  // La fila del concepto no lleva regla propia: sólo la llevan el encabezado y el total.
  const reglas = reqs.filter((r) => r.updateBorders && r.updateBorders.range.startRowIndex === 4)
  assert.equal(reglas.length, 0)
})

test('una regla se dibuja del ancho del bloque, no de la hoja', () => {
  const filas = [['T'], ['n'], ['1 · X'], ['Concepto', 'a', 'b'], ['dato', 1, 2], ['⇒ Total', 3, 4]]
  const reqs = skinRequests({ sheetId: 1, filas, cols: 12 })
  const regla = reqs.find((r) => r.updateBorders && r.updateBorders.range.startRowIndex === 5)
  assert.equal(regla.updateBorders.range.endColumnIndex, 3, 'llega hasta donde hay contenido, no hasta la columna 12')
})

test('el cuerpo se resetea: una itálica del layout anterior no sobrevive', () => {
  const reqs = skinRequests({ sheetId: 1, filas: [['T'], ['n'], ['dato', 1]], cols: 2 })
  const reset = reqs.find((r) => r.repeatCell && r.repeatCell.fields === 'userEnteredFormat.textFormat'
    && r.repeatCell.range.startRowIndex === 0 && r.repeatCell.range.endRowIndex === 3)
  assert.ok(reset, 'hay un reset tipográfico sobre toda la grilla')
  assert.equal(reset.repeatCell.cell.userEnteredFormat.textFormat.bold, false)
})

test('la limpieza llega hasta el final de la HOJA, no de la grilla', () => {
  // Una pestaña que se acorta deja bordes y altos colgando debajo del contenido: se ven como reglas
  // grises flotando sobre la nada. Es lo que el dueño llamó "se corrompe de la fila 53 en adelante".
  const reqs = skinRequests({ sheetId: 1, filas: [['T'], ['n'], ['x', 1]], cols: 3, filasHoja: 80 })
  const limpieza = reqs.find((r) => r.updateBorders && r.updateBorders.range.endRowIndex === 80)
  assert.ok(limpieza, 'los bordes se borran hasta la fila 80')
  const altos = reqs.find((r) => r.updateDimensionProperties?.properties?.pixelSize === 21)
  assert.equal(altos.updateDimensionProperties.range.endIndex, 80)
})
