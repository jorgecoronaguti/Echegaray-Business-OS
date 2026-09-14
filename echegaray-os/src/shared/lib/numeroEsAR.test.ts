// UN NÚMERO SE ESCRIBE COMO SE ESCRIBE ACÁ (dueño, 15/09/2026).
//
// Textual: *«necesito q mejores la ux de cada celda donde pueda modificar, me aparecen unas flechas para arriba y
// abajo q no son utiles»*. Las flechas son el spinner de `<input type="number">`, que además rechaza «266.000» y
// «$ 266.000». Las celdas pasan a `type="text"` con `inputMode="decimal"` y este parser, el único.
//
// MUTACIÓN QUE LO PONE ROJO: tratar el punto siempre como decimal (266.000 → 266).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerNumeroEsAR, indiceDeLaSiguiente } from './numeroEsAR.ts'

const valor = (t: string) => {
  const r = leerNumeroEsAR(t)
  return r.ok ? r.valor : 'inválido'
}

test('ACEPTA LOS FORMATOS DE ACÁ', () => {
  assert.equal(valor('266000'), 266000)
  assert.equal(valor('266.000'), 266000, 'MUTACIÓN: el punto de miles leído como decimal da 266')
  assert.equal(valor('$ 266.000'), 266000)
  assert.equal(valor('$266.000'), 266000)
  assert.equal(valor('266.000,50'), 266000.5)
  assert.equal(valor('266000,5'), 266000.5)
  assert.equal(valor('1.234.567,89'), 1234567.89)
  assert.equal(valor(' 8,5 '), 8.5)
})

test('LAS HORAS CON PUNTO DECIMAL SIGUEN SIENDO HORAS', () => {
  assert.equal(valor('8.5'), 8.5, 'un punto que no deja 3 dígitos es decimal')
  assert.equal(valor('12.25'), 12.25)
  assert.equal(valor('0'), 0, 'un cero escrito es una afirmación')
})

test('VACÍO ES «SIN VALOR»; TEXTO ES INVÁLIDO', () => {
  assert.deepEqual(leerNumeroEsAR(''), { ok: true, valor: null })
  assert.deepEqual(leerNumeroEsAR('   '), { ok: true, valor: null })
  assert.equal(valor('abc'), 'inválido')
  assert.equal(valor('12a'), 'inválido')
  assert.equal(valor('1,2,3'), 'inválido')
  assert.equal(valor('--5'), 'inválido')
})

test('TAB PASA A LA SIGUIENTE CELDA DE LA FILA; SHIFT+TAB A LA ANTERIOR; EN EL BORDE NO HAY SIGUIENTE', () => {
  assert.equal(indiceDeLaSiguiente(5, 1, false), 2)
  assert.equal(indiceDeLaSiguiente(5, 1, true), 0)
  assert.equal(indiceDeLaSiguiente(5, 4, false), null, 'la última celda no salta a otra fila')
  assert.equal(indiceDeLaSiguiente(5, 0, true), null)
  assert.equal(indiceDeLaSiguiente(5, -1, false), null, 'si la celda no está en la fila, no se inventa una')
})
