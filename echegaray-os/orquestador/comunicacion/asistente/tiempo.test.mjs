// Tests del parser temporal. Todos anclados a un `ahora` FIJO: un test de fechas que
// depende del día en que corre es un test que miente el resto del año.
//
// Referencia: viernes 31 de julio de 2026, 15:00 hora AR.
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCuando, parseHoraDelDia, formatearAR, yaPaso, quitarTiempo, paredAR, instanteAR } from './tiempo.mjs'

const VIERNES = new Date('2026-07-31T15:00:00-03:00')
const LUNES = new Date('2026-08-03T09:00:00-03:00')
const cuando = (t, ahora = VIERNES) => parseCuando(t, { ahora })

test('la hora explícita se lee en todas las formas que usa el dueño', () => {
  assert.deepEqual(pick(parseHoraDelDia('a las 8')), { hh: 8, mm: 0, explicita: true })
  assert.deepEqual(pick(parseHoraDelDia('a las 20')), { hh: 20, mm: 0, explicita: true })
  assert.deepEqual(pick(parseHoraDelDia('a las 21:30')), { hh: 21, mm: 30, explicita: true })
  assert.deepEqual(pick(parseHoraDelDia('9hs')), { hh: 9, mm: 0, explicita: true })
  assert.deepEqual(pick(parseHoraDelDia('a las 8 pm')), { hh: 20, mm: 0, explicita: true })
  // Sin hora: 08:00, la MISMA convención que orq.schedules. Y se declara que no la dijo.
  assert.deepEqual(pick(parseHoraDelDia('mañana')), { hh: 8, mm: 0, explicita: false })
})

test('una hora imposible no se acepta como si fuera válida', () => {
  assert.equal(parseHoraDelDia('a las 99').explicita, false)
  assert.equal(parseHoraDelDia('a las 10:75').explicita, false)
})

test('hoy, mañana y pasado mañana caen en el día correcto', () => {
  assert.equal(cuando('hoy a las 20').instante, '2026-07-31T20:00:00-03:00')
  assert.equal(cuando('mañana a las 10').instante, '2026-08-01T10:00:00-03:00')
  assert.equal(cuando('manana a las 10').instante, '2026-08-01T10:00:00-03:00') // sin ñ
  assert.equal(cuando('pasado mañana').instante, '2026-08-02T08:00:00-03:00')
})

test('"a la mañana" es una franja horaria, no el día de mañana', () => {
  // Trampa real: "avisame el martes a la mañana" NO es el miércoles.
  const r = cuando('avisame el martes a la mañana')
  assert.equal(r.instante, '2026-08-04T09:00:00-03:00')
})

test('el día de semana resuelve a la próxima ocurrencia', () => {
  assert.equal(cuando('el martes a las 21').instante, '2026-08-04T21:00:00-03:00')
  assert.equal(cuando('el jueves que viene a las 20').instante, '2026-08-06T20:00:00-03:00')
})

test('"que viene" declara la ambigüedad en vez de elegir por el usuario', () => {
  // Lunes 3/8: "el jueves que viene" puede ser el 6 (esta semana) o el 13. Se pregunta.
  const r = cuando('el jueves que viene a las 20', LUNES)
  assert.equal(r.ambiguo, true)
  assert.equal(r.opciones.length, 2)
  assert.equal(r.opciones[0].valor, '2026-08-06T20:00:00-03:00')
  assert.equal(r.opciones[1].valor, '2026-08-13T20:00:00-03:00')
  // Sin "que viene" no hay ambigüedad: es el jueves más próximo.
  assert.equal(cuando('el jueves a las 20', LUNES).ambiguo, undefined)
})

test('"que viene" NO es ambiguo cuando la ocurrencia ya cae en la semana siguiente', () => {
  // Viernes 31/7: el martes que viene sólo puede ser el 4/8.
  const r = cuando('el martes que viene a las 21')
  assert.equal(r.ambiguo, undefined)
  assert.equal(r.instante, '2026-08-04T21:00:00-03:00')
})

test('duraciones relativas', () => {
  assert.equal(cuando('dentro de dos horas').instante, '2026-07-31T17:00:00-03:00')
  assert.equal(cuando('en 30 minutos').instante, '2026-07-31T15:30:00-03:00')
  assert.equal(cuando('dentro de 3 días').instante, '2026-08-03T15:00:00-03:00')
})

test('fechas calendarias explícitas, con y sin año', () => {
  assert.equal(cuando('el 15 de agosto').instante, '2026-08-15T08:00:00-03:00')
  assert.equal(cuando('el 15/8 a las 10').instante, '2026-08-15T10:00:00-03:00')
  // Un mes ya pasado se entiende del año que viene: "el 3 de enero" en julio no es el pasado.
  assert.equal(cuando('el 3 de enero').instante, '2027-01-03T08:00:00-03:00')
  // Fecha imposible: no se acepta como válida.
  assert.equal(cuando('el 45/13'), null)
})

test('sólo una hora: hoy si todavía no pasó, mañana si ya pasó', () => {
  assert.equal(cuando('a las 21:30').instante, '2026-07-31T21:30:00-03:00')
  assert.equal(cuando('a las 8').instante, '2026-08-01T08:00:00-03:00') // las 8 de hoy ya pasaron
})

test('un texto sin ninguna referencia temporal devuelve null', () => {
  assert.equal(cuando('buscame el contrato de Quattropani'), null)
  assert.equal(cuando(''), null)
})

test('el cruce de mes y de año se hace por calendario, no sumando 30', () => {
  assert.equal(parseCuando('mañana', { ahora: new Date('2026-08-31T10:00:00-03:00') }).instante, '2026-09-01T08:00:00-03:00')
  assert.equal(parseCuando('mañana', { ahora: new Date('2026-12-31T10:00:00-03:00') }).instante, '2027-01-01T08:00:00-03:00')
  assert.equal(parseCuando('pasado mañana', { ahora: new Date('2028-02-28T10:00:00-03:00') }).instante, '2028-03-01T08:00:00-03:00') // bisiesto
})

test('formatear e ir y volver conservan la hora de pared AR', () => {
  assert.equal(formatearAR('2026-08-06T20:00:00-03:00'), 'jueves 6 de agosto a las 20:00')
  assert.equal(formatearAR('2026-08-06T20:00:00-03:00', { conHora: false }), 'jueves 6 de agosto')
  const p = paredAR(new Date('2026-08-06T20:00:00-03:00'))
  assert.equal(instanteAR(p.y, p.m, p.d, p.hh, p.mm), '2026-08-06T20:00:00-03:00')
})

test('yaPaso distingue pasado de futuro', () => {
  assert.equal(yaPaso('2026-07-31T14:00:00-03:00', VIERNES), true)
  assert.equal(yaPaso('2026-07-31T16:00:00-03:00', VIERNES), false)
})

test('quitarTiempo deja el CONTENIDO del pedido', () => {
  const r = cuando('recordame cargar saldos mañana a las 10')
  assert.equal(quitarTiempo('recordame cargar saldos mañana a las 10', r.spans), 'recordame cargar saldos')
})

function pick(h) { return { hh: h.hh, mm: h.mm, explicita: h.explicita } }
