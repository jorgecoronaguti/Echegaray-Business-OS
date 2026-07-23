import test from 'node:test'
import assert from 'node:assert/strict'
import { skinRequests, ES_TOTAL, ES_SECCION, ES_ENCABEZADO } from './estilo-statement.mjs'

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
