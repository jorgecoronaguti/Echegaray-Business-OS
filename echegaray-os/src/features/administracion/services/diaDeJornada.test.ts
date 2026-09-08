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
  // calendario, no un instante. El 01/11/2026 es domingo, así que el salto se prueba llegando a él
  // desde el sábado —tiene que pasar de largo— y volviendo desde el lunes.
  assert.equal(correrDia('2026-10-31', 1), '2026-11-02', 'sábado 31/10 → lunes 2/11, sin frenar')
  assert.equal(correrDia('2026-11-02', -1), '2026-10-31')
  assert.equal(correrDia('2026-03-09', 1), '2026-03-10')
  assert.equal(correrDia('2026-03-09', -1), '2026-03-07', 'lunes 9/3 → sábado 7/3')
})

test('EL DOMINGO NO SE PISA: sábado + 1 es lunes y lunes − 1 es sábado', () => {
  // Orden del dueño 08/09/2026: «los domingos no se trabaja, borralos de la consideración de todos
  // lados». EL DEFECTO QUE ATRAPA: «‹ ayer» y «mañana ›» de la carga del teléfono aterrizaban en un
  // domingo que la grilla ya no dibuja, y el jefe tenía que tocar dos veces para salir.
  assert.equal(correrDia('2026-09-05', 1), '2026-09-07', 'sábado 5 → lunes 7')
  assert.equal(correrDia('2026-09-07', -1), '2026-09-05', 'lunes 7 → sábado 5')
  assert.equal(correrDia('2026-09-04', 1), '2026-09-05', 'viernes → sábado: el sábado SÍ se trabaja')
  assert.equal(correrDia('2026-09-04', 3), '2026-09-08', 'tres pasos saltan el domingo una vez')
  assert.equal(correrDia('2026-09-08', -3), '2026-09-04')
  // Correr CERO días no corrige nada: un domingo que llega por la URL se sigue pudiendo leer.
  assert.equal(correrDia('2026-09-06', 0), '2026-09-06')
})

test('correrDia cruza fin de mes y fin de año', () => {
  assert.equal(correrDia('2026-01-31', 1), '2026-02-02', 'el 01/02/2026 es domingo')
  assert.equal(correrDia('2026-03-02', -1), '2026-02-28', 'el 01/03/2026 es domingo')
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
