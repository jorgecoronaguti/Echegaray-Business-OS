// LO QUE ATRAPA: que la hora del último dato bueno diga algo que no pasó.
//
//   1. INVENTAR UNA HORA cuando nunca hubo lectura. «NULL nunca es cero»: sin sello, se dice «sin
//      lectura previa», no «hace un rato».
//   2. «HACE -3 MIN» cuando el reloj de la máquina está adelantado. Un número imposible en la
//      pantalla del error hace dudar de todo lo demás que la pantalla afirma.
//   3. Confundir «hace 45 min» con «ayer a las 23:50»: la decisión de si lo que ya se vio todavía
//      sirve depende exactamente de esa diferencia.

import test from 'node:test'
import assert from 'node:assert/strict'
import { textoDatoBueno } from './frescura.ts'

// Fechas construidas en hora LOCAL a propósito: la pantalla muestra la hora del reloj de quien
// mira, y un test escrito en UTC pasaría en la máquina de compilación y mentiría en San Juan.
const local = (a: number, m: number, d: number, h: number, min: number) => new Date(a, m - 1, d, h, min, 0)
const AHORA = local(2026, 8, 21, 12, 34)

test('sin sello no se inventa una hora', () => {
  for (const s of [null, undefined, '', 'no es una fecha']) {
    const f = textoDatoBueno(s, AHORA)
    assert.equal(f.hubo, false)
    assert.equal(f.texto, 'sin lectura previa en esta sesión')
  }
})

test('recién: menos de un minuto no se redondea a «hace 0 min»', () => {
  const f = textoDatoBueno(local(2026, 8, 21, 12, 34).toISOString(), AHORA)
  assert.equal(f.texto, '12:34 · recién')
})

test('dentro de la hora se dice cuántos minutos, con la hora al lado', () => {
  const f = textoDatoBueno(local(2026, 8, 21, 12, 31).toISOString(), AHORA)
  assert.equal(f.texto, '12:31 · hace 3 min')
})

test('más de una hora del mismo día: hora del día, sin contar minutos', () => {
  const f = textoDatoBueno(local(2026, 8, 21, 9, 5).toISOString(), AHORA)
  assert.equal(f.texto, 'hoy 09:05')
})

test('el día anterior se nombra ayer, no «hace 800 min»', () => {
  const f = textoDatoBueno(local(2026, 8, 20, 23, 50).toISOString(), AHORA)
  assert.equal(f.texto, 'ayer 23:50')
})

test('más viejo lleva fecha en formato argentino', () => {
  const f = textoDatoBueno(local(2026, 8, 19, 8, 7).toISOString(), AHORA)
  assert.equal(f.texto, '19/08 08:07')
})

test('un sello adelantado no publica un tiempo negativo', () => {
  const f = textoDatoBueno(local(2026, 8, 21, 12, 40).toISOString(), AHORA)
  assert.equal(f.texto, '12:40')
  assert.ok(!f.texto.includes('-'))
})
