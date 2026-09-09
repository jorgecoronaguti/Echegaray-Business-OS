import test from 'node:test'
import assert from 'node:assert/strict'
import { rotuloChip } from './ordenesCliente.ts'

// EL DEFECTO QUE ATRAPA: dibujar «OC ·0». Un chip en cero ocupa el mismo lugar visual que uno que
// informa algo, y quien mira la fila lee «hay órdenes» de un vistazo. Cero órdenes no se dibuja.
test('un conteo en cero no produce chip', () => {
  assert.equal(rotuloChip('OC', 0), null)
  assert.equal(rotuloChip('OP', 0), null)
})

test('el chip lleva el prefijo y el conteo, sin la palabra «órdenes»', () => {
  assert.equal(rotuloChip('OC', 3), 'OC ·3')
  assert.equal(rotuloChip('OP', 11), 'OP ·11')
})
