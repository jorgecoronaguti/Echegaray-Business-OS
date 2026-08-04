import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COL, PENDIENTE, filtrosDeudaViva, filtrosPorCondicion, fuenteCompras, pivotDetalle, pivotPorProveedor,
} from './deuda-viva-pivot.mjs'

const fuente = fuenteCompras({ sheetId: 1666326819, filas: 932 })

// ═══ EL DEFECTO QUE ESTOS TESTS ATRAPAN ═══
// La dinámica salió VACÍA dos veces en el archivo real, sin un solo error a la vista, porque los
// filtros usaban `condition` (NUMBER_EQ / NUMBER_GREATER). Si alguien vuelve a ese camino, estos
// tests se ponen rojos antes de que nadie mire el Sheet.

test('ningún filtro del pivot usa condition: una condición numérica descarta todas las filas en silencio', () => {
  for (const p of [pivotDetalle(fuente), pivotPorProveedor(fuente)]) {
    assert.deepEqual(filtrosPorCondicion(p), [], 'un filtro por condición deja la dinámica vacía sin avisar')
  }
})

test('filtrosPorCondicion delata la configuración que dejó la dinámica vacía', () => {
  const roto = {
    filterSpecs: [{ columnOffsetIndex: 37, filterCriteria: { condition: { type: 'NUMBER_GREATER', values: [{ userEnteredValue: '0' }] } } }],
  }
  assert.deepEqual(filtrosPorCondicion(roto), ['37'])
})

test('los valores visibles van como TEXTO aunque la columna sea numérica', () => {
  const comercial = filtrosDeudaViva().find((f) => f.columnOffsetIndex === COL.comercial)
  assert.deepEqual(comercial.filterCriteria.visibleValues, ['1'])
  assert.equal(typeof comercial.filterCriteria.visibleValues[0], 'string')
})

test('el filtro de estado es el mismo universo que el titular: Pendiente y comercial', () => {
  const specs = filtrosDeudaViva()
  assert.equal(specs.length, 2)
  const estado = specs.find((f) => f.columnOffsetIndex === COL.estado)
  assert.deepEqual(estado.filterCriteria.visibleValues, [PENDIENTE])
})

test('la fuente arranca en la fila de rótulos y está acotada a la grilla real', () => {
  assert.equal(fuente.startRowIndex, 2, 'la fila 3 es el encabezado: arrancar más abajo toma una factura como rótulo')
  assert.equal(fuente.endRowIndex, 932)
  assert.equal(fuente.endColumnIndex, 38, 'la columna 37 es "Saldo pendiente (OS)": sin ella no hay qué sumar')
})

test('fuenteCompras se niega a armar un rango imposible en vez de devolver uno vacío', () => {
  assert.throws(() => fuenteCompras({ sheetId: 1, filas: 2 }), /no puede tener 2 filas/)
  assert.throws(() => fuenteCompras({ filas: 900 }), /falta el sheetId/)
})

test('el detalle suma el saldo ya calculado, no recalcula el criterio en el pivot', () => {
  const p = pivotDetalle(fuente)
  assert.equal(p.values[0].sourceColumnOffset, COL.saldo)
  assert.equal(p.values[0].summarizeFunction, 'SUM')
  assert.deepEqual(p.rows.map((r) => r.sourceColumnOffset), [COL.proveedor, COL.comprobante])
})

test('el gran total sale de showTotals en el nivel externo: sin él el pie desaparece', () => {
  // Medido: con showTotals:false en rows[0] la fila "Suma total" no se emite, y el número contra el
  // que se controla la deuda deja de estar a la vista.
  assert.equal(pivotDetalle(fuente).rows[0].showTotals, true)
  assert.equal(pivotPorProveedor(fuente).rows[0].showTotals, true)
})
