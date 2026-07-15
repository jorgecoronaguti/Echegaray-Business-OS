// Tests de libro-iva.mjs — parsePeriodo y armado del resumen (sin tocar la DB en el parse).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePeriodo } from './libro-iva.mjs'

test('parsePeriodo reconoce mes en texto', () => {
  assert.equal(parsePeriodo('libro iva de junio', '2026'), '2026-06')
  assert.equal(parsePeriodo('iva de mayo 2025'), '2025-05')
  assert.equal(parsePeriodo('posición de iva diciembre', '2026'), '2026-12')
})

test('parsePeriodo reconoce formatos numéricos', () => {
  assert.equal(parsePeriodo('iva 06/2026'), '2026-06')
  assert.equal(parsePeriodo('libro iva 2026-06'), '2026-06')
  assert.equal(parsePeriodo('iva 2026/6'), '2026-06')
})

test('parsePeriodo devuelve null sin período', () => {
  assert.equal(parsePeriodo('libro iva'), null)
  assert.equal(parsePeriodo('cuánto iva pagamos'), null)
})

test('parsePeriodo usa el año default cuando falta', () => {
  assert.equal(parsePeriodo('iva de agosto', '2025'), '2025-08')
})
