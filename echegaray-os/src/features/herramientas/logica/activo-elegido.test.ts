import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activoElegido } from './activo-elegido.ts'

// Códigos reales del parque tras la renumeración a 3 cifras (20260922T0900), incluido un rodado.
const parque = [{ codigo: 'ROD-007' }, { codigo: 'AMO-004' }, { codigo: 'ROD-0001' }, { codigo: 'HER-0042' }]

test('el código que la tabla pone en la URL abre su activo, rodado de 3 cifras incluido', () => {
  assert.equal(activoElegido('ROD-007', parque)?.codigo, 'ROD-007')
  assert.equal(activoElegido('AMO-004', parque)?.codigo, 'AMO-004')
})

test('los códigos anteriores de 4 cifras y lo tipeado a mano siguen resolviendo', () => {
  assert.equal(activoElegido('ROD-0001', parque)?.codigo, 'ROD-0001')
  assert.equal(activoElegido('her 42', parque)?.codigo, 'HER-0042')
  assert.equal(activoElegido('rod 7', parque)?.codigo, 'ROD-007')
  assert.equal(activoElegido('amo4', parque)?.codigo, 'AMO-004')
})

test('lo que no existe o viene vacío no abre nada', () => {
  assert.equal(activoElegido('ROD-099', parque), null)
  assert.equal(activoElegido('', parque), null)
  assert.equal(activoElegido(null, parque), null)
})
