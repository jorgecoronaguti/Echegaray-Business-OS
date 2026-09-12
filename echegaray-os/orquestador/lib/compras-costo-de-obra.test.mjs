import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esCostoDeObra } from '../lib/compras-costo-de-obra.mjs'

// ═══ UNA FILA ELIMINADO NO ES UN COSTO DE OBRA (12/09/2026) ═══
const base = { obra_texto: 'San Francisco', importe: 8346650, total: 0, estado: 'ELIMINADO', anulada: false }

test('ELIMINADO con importe conservado y total en 0: no entra', () => {
  assert.equal(esCostoDeObra(base), false)
})
test('un total en 0 es un dato, no una ausencia: no se cae al importe', () => {
  assert.equal(esCostoDeObra({ ...base, estado: 'Pagado' }), false)
})
test('una compra normal con total entra; sin obra o anulada no', () => {
  assert.equal(esCostoDeObra({ obra_texto: 'Messina', total: 540000, estado: 'Pagado' }), true)
  assert.equal(esCostoDeObra({ obra_texto: 'Messina', importe: 540000, total: null, estado: 'Pendiente' }), true)
  assert.equal(esCostoDeObra({ obra_texto: '', total: 540000, estado: 'Pagado' }), false)
  assert.equal(esCostoDeObra({ obra_texto: 'Messina', total: 540000, estado: 'Pagado', anulada: true }), false)
})
