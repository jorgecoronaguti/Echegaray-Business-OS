import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jornadaPorDefecto } from './jornadaPorDefecto.ts'

// EL DEFECTO QUE ESTOS TESTS ATRAPAN: que la jornada sugerida vuelva a salir de la obra.
//
// Hasta el 08/09/2026 la sugerencia era `obra_canonica.jornada_horas` — 9 para todas y todos los
// días, viernes incluido. El dueño fijó la regla por DÍA DE LA SEMANA, así que un viernes que
// sugiera 9 no es un redondeo: es una hora de más por persona y por semana en la carga de horas.
//
// El fin de semana no tiene defecto. Sugerir 9 un sábado invitaría a guardar una jornada que nadie
// trabajó con un solo toque — la misma forma del defecto que costó las 77,4 HH.

test('de lunes a jueves la jornada por defecto es 9', () => {
  assert.equal(jornadaPorDefecto('2026-09-07'), 9, 'lunes')
  assert.equal(jornadaPorDefecto('2026-09-08'), 9, 'martes')
  assert.equal(jornadaPorDefecto('2026-09-09'), 9, 'miércoles')
  assert.equal(jornadaPorDefecto('2026-09-10'), 9, 'jueves')
})

test('el viernes son 8, no 9', () => {
  assert.equal(jornadaPorDefecto('2026-09-11'), 8)
  assert.equal(jornadaPorDefecto('2026-01-02'), 8, 'un viernes de otro mes y otro año')
})

test('el fin de semana no tiene jornada por defecto: se carga a mano', () => {
  assert.equal(jornadaPorDefecto('2026-09-12'), null, 'sábado')
  assert.equal(jornadaPorDefecto('2026-09-13'), null, 'domingo')
})

// LA FECHA SE LEE EN UTC A PROPÓSITO. Con `new Date('2026-09-11')` interpretado en el huso local
// (UTC−3 en San Juan) el día se corre uno para atrás y el viernes se lee jueves: 9 hs donde van 8.
test('el día no se corre por el huso horario de San Juan', () => {
  assert.equal(jornadaPorDefecto('2026-09-11'), 8, 'viernes leído en UTC, no en UTC−3')
  assert.equal(jornadaPorDefecto('2026-09-14'), 9, 'lunes: no se lee el domingo anterior')
})
