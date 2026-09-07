import test from 'node:test'
import assert from 'node:assert/strict'
import { alcanceDeRango, quedoFuera } from './olvidar-huella-de-formato.mjs'

test('lee hasta dónde llega cada forma de rango que la huella guarda', () => {
  assert.deepEqual(alcanceDeRango('A157:P269'), { fila: 269, col: 16 })
  assert.deepEqual(alcanceDeRango('ROWS:0-1'), { fila: 1, col: 0 })
  assert.deepEqual(alcanceDeRango('COLUMNS:30-31'), { fila: 0, col: 31 })
  assert.equal(alcanceDeRango('*'), null, 'la pestaña entera no describe un rango')
})

test('una huella que todavía cae adentro NO se olvida: puede ser formato del dueño', () => {
  assert.equal(quedoFuera('A157:P269', { filas: 300, cols: 26 }), false)
  assert.equal(quedoFuera('*', { filas: 10, cols: 5 }), false, 'sin rango legible, no se toca')
})

test('y una que apunta más allá del borde describe un layout que ya no existe', () => {
  assert.equal(quedoFuera('G264:G267', { filas: 110, cols: 26 }), true)
  assert.equal(quedoFuera('A5:AZ5', { filas: 300, cols: 26 }), true, 'también por columna')
})
