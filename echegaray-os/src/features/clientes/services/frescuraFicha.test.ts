// QUÉ DEFECTO ATRAPA: que la ficha servida de la caché no diga de cuándo es, o que diga algo sobre
// una ficha calculada en vivo. Las dos mitades importan: callar la edad de una foto la presenta como
// realidad, y ponerle «de hace N min» a un cálculo de este instante enseña a desconfiar de lo cierto.

import test from 'node:test'
import assert from 'node:assert/strict'
import { frescuraDeLaFicha } from './frescuraFicha.ts'

const AHORA = new Date('2026-09-13T18:00:00Z')

test('una ficha calculada en vivo no dice nada', () => {
  assert.equal(frescuraDeLaFicha(null, AHORA), null)
  assert.equal(frescuraDeLaFicha(undefined, AHORA), null)
  assert.equal(frescuraDeLaFicha('', AHORA), null)
})

test('una marca ilegible no inventa una edad', () => {
  assert.equal(frescuraDeLaFicha('no es una fecha', AHORA), null)
})

test('la edad se dice en minutos enteros, redondeando para abajo', () => {
  assert.equal(frescuraDeLaFicha('2026-09-13T17:56:30Z', AHORA), 'datos de hace 3 min')
  assert.equal(frescuraDeLaFicha('2026-09-13T17:50:00Z', AHORA), 'datos de hace 10 min')
})

test('menos de un minuto, o un reloj corrido hacia adelante, se lee como recién', () => {
  assert.equal(frescuraDeLaFicha('2026-09-13T17:59:31Z', AHORA), 'datos de hace menos de 1 min')
  assert.equal(frescuraDeLaFicha('2026-09-13T18:00:20Z', AHORA), 'datos de hace menos de 1 min')
})

test('acepta el timestamptz con microsegundos y zona que manda PostgREST', () => {
  // 14:55:00 en -03:00 son las 17:55 UTC: cinco minutos antes de AHORA, no tres horas.
  assert.equal(frescuraDeLaFicha('2026-09-13T14:55:00.123456-03:00', AHORA), 'datos de hace 4 min')
})
