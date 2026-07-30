import test from 'node:test'
import assert from 'node:assert/strict'
import { hoyIso, validarFecha, fechaLegible, ZONA } from './fechas.mjs'

const HOY = '2026-07-30'

test('hoy se calcula en San Juan, no en UTC ni en el huso del servidor', () => {
  assert.equal(ZONA, 'America/Argentina/San_Juan')
  // 31/07 00:30 UTC es todavía el 30/07 a las 21:30 en San Juan.
  assert.equal(hoyIso(new Date('2026-07-31T00:30:00Z')), '2026-07-30')
  assert.equal(hoyIso(new Date('2026-07-31T03:30:00Z')), '2026-07-31')
})

test('sin fecha se asume hoy: el caso normal es cargar el día en curso', () => {
  assert.deepEqual(validarFecha('', { hoy: HOY }), { ok: true, fecha: HOY })
  assert.deepEqual(validarFecha(null, { hoy: HOY }), { ok: true, fecha: HOY })
})

test('una fecha pasada se acepta', () => {
  assert.deepEqual(validarFecha('2026-07-17', { hoy: HOY }), { ok: true, fecha: '2026-07-17' })
})

test('una fecha futura se rechaza', () => {
  const r = validarFecha('2026-07-31', { hoy: HOY })
  assert.equal(r.ok, false)
  assert.match(r.error, /futura/i)
})

test('una fecha que no existe se rechaza', () => {
  for (const mala of ['2026-02-30', '2026-13-01', '30/07/2026', 'hoy', '2026-7-3']) {
    assert.equal(validarFecha(mala, { hoy: HOY }).ok, false, mala)
  }
})

test('fechaLegible muestra el formato argentino', () => {
  assert.equal(fechaLegible('2026-07-30'), '30/07/2026')
})

test('una fecha que viene de Postgres (objeto Date) se acepta', () => {
  // La sesión guarda `fecha_operativa` como columna `date`; el driver la devuelve como Date.
  // Sin tolerarlo, el jefe elegía la obra y le respondían que la fecha no existe.
  const r = validarFecha(new Date('2026-07-30T03:00:00Z'), { hoy: '2026-07-30' })
  assert.equal(r.ok, true)
  assert.equal(r.fecha, '2026-07-30')
})

test('un Date futuro se sigue rechazando', () => {
  const r = validarFecha(new Date('2026-08-05T03:00:00Z'), { hoy: '2026-07-30' })
  assert.equal(r.ok, false)
  assert.match(r.error, /futura/i)
})
