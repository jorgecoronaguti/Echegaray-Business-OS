import { test } from 'node:test'
import assert from 'node:assert/strict'
import { duenoReescribioLaPestana } from './respetar-ediciones.mjs'

const filas = (...rotulos) => rotulos.map((r) => [r])

test('cuando la MAYORÍA de los rótulos del generador siguen, NO es reescritura', () => {
  const generado = filas('1 · POSICIÓN', '2 · COBROS', '3 · PAGOS', '4 · SALDO', '⇒ Total', 'Semana', 'Detalle', 'Neto', 'Banco')
  const actual = filas('1 · POSICIÓN', '2 · COBROS', '3 · PAGOS', '4 · SALDO', '⇒ Total', 'Semana', 'Detalle', 'Neto', 'Banco', 'una nota mía')
  assert.equal(duenoReescribioLaPestana(generado, actual).reescrita, false)
})

test('cuando el dueño reescribió la pestaña entera (casi ningún rótulo mío queda), SÍ es reescritura', () => {
  const generado = filas('1 · POSICIÓN', '2 · COBROS', '3 · PAGOS', '4 · SALDO', '⇒ Total', 'Semana', 'Detalle', 'Neto', 'Banco', 'Tarjeta')
  // el dueño lo reescribió como estado de flujo indirecto: otros títulos
  const actual = filas('Estado de flujo indirecto', 'Resultado del período', 'Ajustes', 'Variación capital de trabajo', 'Flujo operativo')
  const r = duenoReescribioLaPestana(generado, actual)
  assert.equal(r.reescrita, true)
  assert.ok(r.fraccion < 0.35)
})

test('una pestaña VACÍA o lectura parcial NO se toma como reescritura (no auto-candar por un blip)', () => {
  const generado = filas('1 · A', '2 · B', '3 · C', '4 · D', '5 · E', '6 · F', '7 · G', '8 · H')
  assert.equal(duenoReescribioLaPestana(generado, []).reescrita, false)
  assert.equal(duenoReescribioLaPestana(generado, [['']]).reescrita, false)
})

test('pocas anclas → no se juzga (evita falsos positivos en pestañas chicas)', () => {
  const generado = filas('A', 'B', 'C')
  assert.equal(duenoReescribioLaPestana(generado, filas('X', 'Y')).reescrita, false)
})

test('el apóstrofo de fuerza-texto no rompe la comparación', () => {
  const generado = filas('1 · POSICIÓN', '2 · COBROS', '3 · PAGOS', '4 · SALDO', '5 · NETO', '6 · BANCO', '7 · CAJA', '8 · TOTAL')
  const actual = filas("'1 · POSICIÓN", "'2 · COBROS", "'3 · PAGOS", "'4 · SALDO", "'5 · NETO", "'6 · BANCO", "'7 · CAJA", "'8 · TOTAL")
  assert.equal(duenoReescribioLaPestana(generado, actual).reescrita, false, 'los mismos rótulos con apóstrofo NO son una reescritura')
})
