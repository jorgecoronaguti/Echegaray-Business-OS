import { test } from 'node:test'
import assert from 'node:assert/strict'
import { firmaDeGrid, humanoEdito } from './firma-tab.mjs'

test('la misma grilla da la misma firma (estable)', () => {
  const g = [['Semana', 'Cobros'], ['1', '=SUM(A1:A5)']]
  assert.equal(firmaDeGrid(g), firmaDeGrid(g.map((f) => [...f])))
})

test('un cambio de una persona (texto o fórmula) cambia la firma', () => {
  const base = [['Semana', 'Cobros'], ['1', '=SUM(A1:A5)']]
  const editaTexto = [['Semana', 'Cobranzas'], ['1', '=SUM(A1:A5)']] // cambió un rótulo
  const editaFormula = [['Semana', 'Cobros'], ['1', '=SUM(A1:A9)']]  // cambió una fórmula
  assert.notEqual(firmaDeGrid(base), firmaDeGrid(editaTexto))
  assert.notEqual(firmaDeGrid(base), firmaDeGrid(editaFormula))
})

test('filas vacías al final NO cambian la firma (Google recorta/agrega filas vacías)', () => {
  const a = [['x', 'y'], ['1', '2']]
  const b = [['x', 'y'], ['1', '2'], ['', ''], ['']]
  assert.equal(firmaDeGrid(a), firmaDeGrid(b))
})

test('el trim de celdas no cambia la firma (espacios de más del ida y vuelta)', () => {
  const a = [['Semana', 'Cobros']]
  const b = [['Semana ', ' Cobros']]
  assert.equal(firmaDeGrid(a), firmaDeGrid(b))
})

test('humanoEdito: sin baseline no se puede afirmar que editó', () => {
  assert.deepEqual(humanoEdito('abc', null), { editado: false, hayBaseline: false })
})

test('humanoEdito: con baseline, mismatch = editó; match = no editó', () => {
  assert.deepEqual(humanoEdito('abc', 'abc'), { editado: false, hayBaseline: true })
  assert.deepEqual(humanoEdito('xyz', 'abc'), { editado: true, hayBaseline: true })
})
