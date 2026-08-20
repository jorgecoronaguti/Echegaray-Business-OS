import { test } from 'node:test'
import assert from 'node:assert/strict'
import { duracion, hora, lecturaDelDia, pendienteDeImputar, siguienteAccion, totalDelPeriodo } from './asistencia.ts'
import type { DiaDeAsistencia } from '../types/index.ts'

const dia = (p: Partial<DiaDeAsistencia>): DiaDeAsistencia => ({
  fecha: '2026-08-20', entrada: null, salida: null, incidencias: 0, motivo: null,
  estado: 'sin_registrar', minutos: null, obra_id: null, ...p,
})

test('la acción es UNA sola y sigue al estado', () => {
  assert.equal(siguienteAccion(null).tipo, 'entrada')
  assert.equal(siguienteAccion(dia({ estado: 'en_curso' })).tipo, 'salida')
  assert.equal(siguienteAccion(dia({ estado: 'falta_salida' })).tipo, 'salida')
  // Con el día cerrado NO hay acción: ofrecer «registrar entrada» de nuevo duplicaría el día.
  assert.equal(siguienteAccion(dia({ estado: 'completo' })).tipo, null)
})

test('«falta salida» avisa en warn, no acusa en neg', () => {
  assert.equal(lecturaDelDia(dia({ estado: 'falta_salida' })).tono, 'warn')
  assert.equal(lecturaDelDia(dia({ estado: 'en_curso' })).tono, 'curso')
})

test('la hora no lleva segundos y una fecha inválida no rompe la pantalla', () => {
  assert.equal(hora('2026-08-20T07:58:12-03:00'), '07:58')
  assert.equal(hora('no es una fecha'), null)
  assert.equal(hora(null), null)
})

test('la duración se lee en reloj, no en decimal', () => {
  assert.equal(duracion(460), '7 h 40 min')
  assert.equal(duracion(480), '8 h')
  assert.equal(duracion(40), '40 min')
  assert.equal(duracion(null), null)
  assert.equal(duracion(-5), null, 'un negativo es un defecto, no un dato: no se dibuja')
})

test('EL TOTAL NO INVENTA EL DÍA ABIERTO — y dice cuántos quedaron afuera', () => {
  // El defecto que atrapa: sumar el día en curso como 0 h da un total que parece completo y no lo
  // está; sumarlo «hasta ahora» fabrica horas que nadie trabajó.
  const t = totalDelPeriodo([
    dia({ estado: 'completo', minutos: 480 }),
    dia({ estado: 'completo', minutos: 460 }),
    dia({ estado: 'en_curso' }),
    dia({ estado: 'falta_salida' }),
    dia({ estado: 'sin_registrar' }),
  ])
  assert.equal(t.minutos, 940)
  assert.equal(t.sinCerrar, 2, 'el día en curso y el que quedó sin salida')
})

test('presencia vs HH: sin las dos puntas NO se calcula el pendiente', () => {
  // El defecto que atrapa: sin una sola marca de asistencia, «pendiente 148 h» acusa a la obra de no
  // imputar cuando lo que falta es la asistencia.
  assert.equal(pendienteDeImputar(0, 148), null)
  assert.equal(pendienteDeImputar(9080, 0), null)
  const r = pendienteDeImputar(9080, 148)
  assert.ok(r)
  assert.equal(r.pendiente, 9080 - 8880)
})
