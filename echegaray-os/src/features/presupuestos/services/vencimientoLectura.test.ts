// EL DEFECTO QUE ATRAPA: que el vencimiento mate un trabajo VIVO (el peor de los dos errores: se
// pierde una corrida que ya pagó sus llamadas de visión) o que no destrabe uno muerto (la pantalla
// sondeando infinito, que es de donde vino todo esto).

import test from 'node:test'
import assert from 'node:assert/strict'
import { MINUTOS_SIN_LATIDO, pareceColgada } from './vencimientoLectura.ts'

const AHORA = Date.parse('2026-09-03T12:00:00.000Z')
const haceMinutos = (m: number) => new Date(AHORA - m * 60_000).toISOString()

test('un trabajo que late no vence NUNCA, por larga que sea la corrida', () => {
  // El tramo lento son ~20 llamadas de visión: sin latido, un trabajo sano vencería a mitad de
  // camino. Con latido de 60 s, `actualizado` nunca tiene más de un minuto.
  assert.equal(pareceColgada({ estado: 'LEYENDO', actualizado: haceMinutos(0.5) }, AHORA), false)
  assert.equal(pareceColgada({ estado: 'LEYENDO', actualizado: haceMinutos(MINUTOS_SIN_LATIDO - 0.1) }, AHORA), false)
})

test('un trabajo que dejó de latir por más del umbral está muerto, no lento', () => {
  assert.equal(pareceColgada({ estado: 'LEYENDO', actualizado: haceMinutos(MINUTOS_SIN_LATIDO + 0.1) }, AHORA), true)
  assert.equal(pareceColgada({ estado: 'LEYENDO', actualizado: haceMinutos(240) }, AHORA), true)
})

test('justo en el umbral todavía no vence — el corte es estrictamente mayor', () => {
  assert.equal(pareceColgada({ estado: 'LEYENDO', actualizado: haceMinutos(MINUTOS_SIN_LATIDO) }, AHORA), false)
})

test('ENCOLADO no vence: puede estar esperando a que el worker termine OTRA lectura', () => {
  assert.equal(pareceColgada({ estado: 'ENCOLADO', actualizado: haceMinutos(120) }, AHORA), false)
})

test('un trabajo que YA terminó no se vence — ni LISTO, ni ERROR, ni CANCELADO', () => {
  for (const estado of ['LISTO', 'ERROR', 'CANCELADO']) {
    assert.equal(pareceColgada({ estado, actualizado: haceMinutos(9999) }, AHORA), false, `${estado} no se puede volver ERROR por viejo`)
  }
})

test('sin fecha, o con una fecha ilegible, no se mata nada: la duda no es prueba de muerte', () => {
  assert.equal(pareceColgada({ estado: 'LEYENDO', actualizado: null }, AHORA), false)
  assert.equal(pareceColgada({ estado: 'LEYENDO', actualizado: 'ayer a la tarde' }, AHORA), false)
  assert.equal(pareceColgada({}, AHORA), false)
})
