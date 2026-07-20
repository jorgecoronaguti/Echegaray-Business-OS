import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMonto } from './cash-briefing.mjs'

test('lee importes en es-AR', () => {
  assert.equal(parseMonto('$ 1.234.567,89'), 1234567.89)
  assert.equal(parseMonto('531000'), 531000)
  assert.equal(parseMonto(''), 0)
  assert.equal(parseMonto(null), 0)
  assert.equal(parseMonto('—'), 0)
})

// El bug que costó $1.093.849 de diferencia entre el núcleo y el Sheet: tres notas de crédito
// entraron como cargos positivos porque el Sheet las muestra entre paréntesis y el parser los tiraba.
test('los paréntesis son el signo menos, no decoración', () => {
  assert.equal(parseMonto('($ 531.000,00)'), -531000)
  assert.equal(parseMonto('(1.234,50)'), -1234.5)
  assert.equal(parseMonto('-$ 531.000,00'), -531000)
  // Un paréntesis suelto que no envuelve todo NO es notación contable.
  assert.equal(parseMonto('$ 1.000 (parcial'), 1000)
})
