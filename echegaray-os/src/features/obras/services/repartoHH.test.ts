// EL REPARTO DE LA CARGA MASIVA — lo que se imputa y lo que NO.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// La carga masiva pone un casillero de horas por persona y el que no trabajó se deja vacío. Si un
// campo vacío se leyera como `Number('') === 0` y se imputara igual, cada carga de cuadrilla
// generaría una fila de 0 HH por cada ausente: el conteo de imputaciones mentiría, la clave única
// quedaría ocupada para ese día, y corregir después sería imposible sin borrar a mano.
//
// El segundo defecto es el separador decimal: en un teclado en español, media jornada se escribe
// «4,5». Con `Number('4,5') === NaN` esa persona se caía del reparto EN SILENCIO.

import test from 'node:test'
import assert from 'node:assert/strict'
import { leerReparto, totalDelReparto } from './repartoHH.ts'

const UNO = '11111111-1111-4111-8111-111111111111'
const DOS = '22222222-2222-4222-8222-222222222222'

test('el casillero vacío NO se imputa como cero', () => {
  const r = leerReparto([[`horas_${UNO}`, '8'], [`horas_${DOS}`, '']])
  assert.deepEqual(r, [{ persona_id: UNO, horas: 8 }])
})

test('el cero explícito tampoco se imputa: es la forma de sacar a alguien de la carga', () => {
  assert.deepEqual(leerReparto([[`horas_${UNO}`, '0']]), [])
})

test('un valor negativo o un texto se ignoran en vez de convertirse en horas', () => {
  assert.deepEqual(leerReparto([[`horas_${UNO}`, '-4'], [`horas_${DOS}`, 'ocho']]), [])
})

test('la coma decimal es media jornada, no NaN', () => {
  assert.deepEqual(leerReparto([[`horas_${UNO}`, '4,5']]), [{ persona_id: UNO, horas: 4.5 }])
})

test('los otros campos del formulario no entran al reparto', () => {
  // `fecha`, `actividad_id` y `notas` viajan en el mismo FormData. Si el patrón fuera laxo, una
  // actividad con uuid podría colarse como si fuera una persona.
  const r = leerReparto([
    ['fecha', '2026-08-19'],
    ['actividad_id', UNO],
    ['notas', 'lo que sea'],
    [`horas_${DOS}`, '6'],
  ])
  assert.deepEqual(r, [{ persona_id: DOS, horas: 6 }])
})

test('una clave que no es un uuid no se acepta', () => {
  assert.deepEqual(leerReparto([['horas_pepe', '8'], ['horas_123', '8']]), [])
})

test('el total es el que se le informa a quien cargó', () => {
  assert.equal(totalDelReparto([{ persona_id: UNO, horas: 8 }, { persona_id: DOS, horas: 4.5 }]), 12.5)
})
