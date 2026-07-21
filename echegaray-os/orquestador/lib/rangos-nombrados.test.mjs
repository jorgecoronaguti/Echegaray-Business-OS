import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pedidos, ARCA } from './rangos-nombrados.mjs'

test('crea el nombre cuando no existe', () => {
  const [p] = pedidos(7, [{ name: 'ARCA_COMPRAS_N', fila: 10, col: 4 }], [])
  assert.ok(p.addNamedRange)
  assert.deepEqual(p.addNamedRange.namedRange.range, {
    sheetId: 7, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 3, endColumnIndex: 4,
  })
})

test('ACTUALIZA el que ya existe en vez de duplicarlo', () => {
  // La API no falla al repetir un nombre: se queda con dos rangos homónimos y las fórmulas empiezan
  // a leer el equivocado, sin ningún error visible.
  const [p] = pedidos(7, [{ name: 'ARCA_COMPRAS_N', fila: 20, col: 4 }], [{ name: 'ARCA_COMPRAS_N', namedRangeId: 'abc' }])
  assert.ok(p.updateNamedRange)
  assert.equal(p.updateNamedRange.namedRange.namedRangeId, 'abc')
  assert.equal(p.updateNamedRange.namedRange.range.startRowIndex, 19, 'apunta a la fila nueva')
})

test('cada nombre apunta a UNA sola celda', () => {
  for (const p of pedidos(1, Object.values(ARCA).map((name, i) => ({ name, fila: i + 2, col: 3 })), [])) {
    const r = p.addNamedRange.namedRange.range
    assert.equal(r.endRowIndex - r.startRowIndex, 1)
    assert.equal(r.endColumnIndex - r.startColumnIndex, 1)
  }
})

test('los nombres del contrato son únicos', () => {
  const v = Object.values(ARCA)
  assert.equal(v.length, new Set(v).size)
})

test('sin destinos no manda ningún pedido', () => {
  assert.deepEqual(pedidos(1, [], []), [])
})
