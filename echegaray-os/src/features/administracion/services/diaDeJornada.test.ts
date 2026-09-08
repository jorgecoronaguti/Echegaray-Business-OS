import { test } from 'node:test'
import assert from 'node:assert/strict'
import { correrDia, diaDeCarga, esFechaISO, hoyISO, rotuloDelDia } from './diaDeJornada.ts'

// QUÉ DEFECTO ATRAPA CADA UNO. Estas cuatro funciones deciden qué día se escribe en `registros_hh`:
// un día corrido de más es una jornada imputada al día equivocado.

test('rotuloDelDia dice el día de la semana, no sólo el número', () => {
  // 07/09/2026 fue lunes. Sin el nombre del día, «7 de septiembre» no ubica a nadie en la obra.
  assert.equal(rotuloDelDia('2026-09-07'), 'lunes 7 de septiembre')
  assert.equal(rotuloDelDia('2026-01-01'), 'jueves 1 de enero')
})

test('correrDia no se come ni repite un día al cruzar un cambio de horario', () => {
  // EL DEFECTO: con `new Date(fecha)` en hora local y +24h, el 01/11 (cambio de hora en el
  // hemisferio norte) devuelve el mismo día. Se calcula en UTC porque la fecha del parte es un día
  // calendario, no un instante.
  assert.equal(correrDia('2026-10-31', 1), '2026-11-01')
  assert.equal(correrDia('2026-11-01', -1), '2026-10-31')
  assert.equal(correrDia('2026-03-08', 1), '2026-03-09')
  assert.equal(correrDia('2026-03-08', -1), '2026-03-07')
})

test('correrDia cruza fin de mes y fin de año', () => {
  assert.equal(correrDia('2026-01-31', 1), '2026-02-01')
  assert.equal(correrDia('2026-03-01', -1), '2026-02-28')
  assert.equal(correrDia('2026-12-31', 1), '2027-01-01')
})

test('esFechaISO rechaza lo que no es una fecha', () => {
  assert.equal(esFechaISO('2026-09-07'), true)
  assert.equal(esFechaISO('ayer'), false)
  assert.equal(esFechaISO('2026-9-7'), false)
  assert.equal(esFechaISO(undefined), false)
  assert.equal(esFechaISO(null), false)
})

test('diaDeCarga cae a hoy ante basura y respeta la fecha pedida', () => {
  assert.equal(diaDeCarga('2026-09-05', '2026-09-07'), '2026-09-05')
  assert.equal(diaDeCarga('ayer', '2026-09-07'), '2026-09-07')
  assert.equal(diaDeCarga(undefined, '2026-09-07'), '2026-09-07')
  // El futuro NO se recorta: la pantalla ofrece «mañana ›» y quien rechaza es la policy.
  assert.equal(diaDeCarga('2026-09-08', '2026-09-07'), '2026-09-08')
})

test('hoyISO usa la fecha LOCAL, no el UTC del servidor', () => {
  // EL DEFECTO: `toISOString().slice(0,10)` en Argentina (UTC-3) devuelve el día SIGUIENTE a partir
  // de las 21:00. La asistencia del lunes a la noche se guardaría con fecha martes.
  const nocheDelLunes = new Date(2026, 8, 7, 22, 30)
  assert.equal(hoyISO(nocheDelLunes), '2026-09-07')
  assert.notEqual(hoyISO(nocheDelLunes), nocheDelLunes.toISOString().slice(0, 10))
})
