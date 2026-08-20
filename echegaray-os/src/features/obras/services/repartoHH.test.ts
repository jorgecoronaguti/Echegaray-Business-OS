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
  assert.deepEqual(r, [{ persona_id: UNO, horas: 8, tipo_hora: undefined }])
})

test('el cero explícito tampoco se imputa: es la forma de sacar a alguien de la carga', () => {
  assert.deepEqual(leerReparto([[`horas_${UNO}`, '0']]), [])
})

test('un valor negativo o un texto se ignoran en vez de convertirse en horas', () => {
  assert.deepEqual(leerReparto([[`horas_${UNO}`, '-4'], [`horas_${DOS}`, 'ocho']]), [])
})

test('la coma decimal es media jornada, no NaN', () => {
  assert.deepEqual(leerReparto([[`horas_${UNO}`, '4,5']]), [{ persona_id: UNO, horas: 4.5, tipo_hora: undefined }])
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
  assert.deepEqual(r, [{ persona_id: DOS, horas: 6, tipo_hora: undefined }])
})

test('una clave que no es un uuid no se acepta', () => {
  assert.deepEqual(leerReparto([['horas_pepe', '8'], ['horas_123', '8']]), [])
})

test('el total es el que se le informa a quien cargó', () => {
  assert.equal(totalDelReparto([{ persona_id: UNO, horas: 8 }, { persona_id: DOS, horas: 4.5 }]), 12.5)
})


// ═══ EL TIPO DE HORA POR PERSONA (19/08/2026) ═══
//
// El dueño pidió poder cambiarle el tipo a UNO SOLO de la cuadrilla: *"cambiar tipo de hora de una
// persona"*. En una cuadrilla que se quedó hasta tarde, dos hicieron extras y el resto no — sin tipo
// propio habría que cargar la misma cuadrilla dos veces.

test('cada persona puede llevar su propia clase de hora', () => {
  const r = leerReparto([
    [`horas_${UNO}`, '8'], [`tipo_${UNO}`, 'normal'],
    [`horas_${DOS}`, '2'], [`tipo_${DOS}`, 'extra_50'],
  ])
  assert.deepEqual(r, [
    { persona_id: UNO, horas: 8, tipo_hora: 'normal' },
    { persona_id: DOS, horas: 2, tipo_hora: 'extra_50' },
  ])
})

test('el tipo que llega DESPUÉS de las horas se toma igual', () => {
  // `FormData` no garantiza orden entre campos de la misma persona: leer en una sola pasada dejaba
  // el tipo afuera según cómo el navegador serializara el formulario.
  const r = leerReparto([[`horas_${UNO}`, '3'], [`tipo_${UNO}`, 'extra_100']])
  assert.equal(r[0].tipo_hora, 'extra_100')
})

test('sin tipo propio queda indefinido: lo resuelve el tipo general del formulario', () => {
  const r = leerReparto([[`horas_${UNO}`, '8'], [`tipo_${UNO}`, '  ']])
  assert.equal(r[0].tipo_hora, undefined)
})
