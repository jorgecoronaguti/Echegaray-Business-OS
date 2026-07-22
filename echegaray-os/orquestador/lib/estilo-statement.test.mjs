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
