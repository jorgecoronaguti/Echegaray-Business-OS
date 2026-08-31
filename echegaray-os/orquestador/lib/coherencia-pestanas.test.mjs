// EL CONTROL TIENE QUE PODER DAR ROJO. Es la única prueba de que sirve.
//
// Este repo ya pagó la lección: un control que en producción da verde siempre porque su predicado no
// puede dar falso es una constante con cara de control ($4,1 M invisibles, 28/08). Así que la mitad
// de este archivo construye los casos ROJOS con los números reales del 31/08.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { frescuraDe, cruzar, veredicto, FRESCURA, COHERENCIA } from './coherencia-pestanas.mjs'

const AHORA = new Date('2026-08-31T22:00:00Z')

test('FRESCURA: la que se rehizo hoy está al día; SUBCONTRATISTAS, atrasada 10 días', () => {
  const hoy = frescuraDe({ pestana: 'Nómina', escritoEn: '2026-08-31T21:00:00Z' }, { ahora: AHORA })
  assert.equal(hoy.estado, FRESCURA.AL_DIA)
  const vieja = frescuraDe({ pestana: 'SUBCONTRATISTAS', escritoEn: '2026-08-21T13:02:00Z' }, { ahora: AHORA })
  assert.equal(vieja.estado, FRESCURA.ATRASADA)
  assert.ok(vieja.horas > 240, `${vieja.horas} h`)
})

test('una pestaña trabada por el dueño NO es un hallazgo, y una sin generador tampoco', () => {
  assert.equal(frescuraDe({ pestana: 'Cheques Emitidos', escritoEn: '2026-08-22T13:44:00Z', candado: true }, { ahora: AHORA }).estado, FRESCURA.CANDADO)
  assert.equal(frescuraDe({ pestana: '_UOCRA_RAW', escritoEn: null, tieneGenerador: false }, { ahora: AHORA }).estado, FRESCURA.SIN_GENERADOR)
})

test('sin firma NO se dice «vieja»: se dice que no se pudo mirar', () => {
  assert.equal(frescuraDe({ pestana: 'X', escritoEn: null }, { ahora: AHORA }).estado, FRESCURA.NO_VERIFICABLE)
  assert.equal(frescuraDe({ pestana: 'X', escritoEn: 'no es una fecha' }, { ahora: AHORA }).estado, FRESCURA.NO_VERIFICABLE)
})

test('CRUCE ROJO REAL: oficina vale $3.600.000 en Nómina y $2.860.829 en Jornales', () => {
  const c = cruzar({ que: 'oficina de la quincena', izquierda: 'Nómina', derecha: 'Jornales por Quincena', a: 3600000, b: 2860829 })
  assert.equal(c.estado, COHERENCIA.DISCREPA)
  assert.equal(c.delta, 739171)
})

test('CRUCE VERDE: el mismo hecho con el mismo número, dentro del peso de un centavo', () => {
  assert.equal(cruzar({ que: 'x', a: 10653583, b: 10653583.4, tolerancia: 1 }).estado, COHERENCIA.CONDICE)
  assert.equal(cruzar({ que: 'x', a: 10653583, b: 10653585, tolerancia: 1 }).estado, COHERENCIA.DISCREPA)
})

test('DOS VACÍOS NO COINCIDEN: si un lado no se pudo leer, el cruce no dice que cierra', () => {
  for (const par of [[null, 5], [5, null], [null, null], ['x', 5]]) {
    const c = cruzar({ que: 'x', a: par[0], b: par[1] })
    assert.equal(c.estado, COHERENCIA.NO_VERIFICABLE, `${JSON.stringify(par)} se dio por bueno`)
    assert.equal(c.delta, null)
  }
})

test('VEREDICTO: una sola discrepancia pone todo en ROJO y la salida en 1', () => {
  const v = veredicto({
    frescuras: [frescuraDe({ pestana: 'Nómina', escritoEn: '2026-08-31T21:00:00Z' }, { ahora: AHORA })],
    cruces: [cruzar({ que: 'ok', a: 1, b: 1 }), cruzar({ que: 'mal', a: 3600000, b: 2860829 })],
  })
  assert.equal(v.color, 'ROJO')
  assert.equal(v.salida, 1)
  assert.equal(v.discrepan, 1)
})

test('VEREDICTO: no poder mirar NO es verde — es amarillo, y con nombre', () => {
  const v = veredicto({
    frescuras: [frescuraDe({ pestana: 'SUBCONTRATISTAS', escritoEn: '2026-08-21T13:02:00Z' }, { ahora: AHORA })],
    cruces: [cruzar({ que: 'ciego', a: null, b: 3 })],
  })
  assert.equal(v.color, 'AMARILLO')
  assert.equal(v.salida, 1)
  assert.equal(v.ciegos, 1)
  assert.deepEqual(v.atrasadas, ['SUBCONTRATISTAS'])
})

test('VEREDICTO VERDE: sólo cuando todo lo que se miró cerró y nada quedó ciego', () => {
  const v = veredicto({
    frescuras: [
      frescuraDe({ pestana: 'A', escritoEn: '2026-08-31T21:00:00Z' }, { ahora: AHORA }),
      frescuraDe({ pestana: 'Cheques Emitidos', escritoEn: '2026-08-22T13:44:00Z', candado: true }, { ahora: AHORA }),
    ],
    cruces: [cruzar({ que: 'ok', a: 100, b: 100 })],
  })
  assert.equal(v.color, 'VERDE')
  assert.equal(v.salida, 0)
})
