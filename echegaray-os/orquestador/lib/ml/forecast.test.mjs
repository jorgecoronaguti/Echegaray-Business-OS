// LAS LÍNEAS DE BASE DEL PRONÓSTICO. Cada test protege una decisión de plata.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mae, wape, naive, mediaMovil, medianaMovil, tendencia, estacionalSemanal, backtest, combinar } from './forecast.mjs'

test('WAPE en vez de MAPE: una serie de caja tiene días en CERO', () => {
  // MAPE divide por el real: un solo día en cero lo manda a infinito y la métrica deja de existir.
  // WAPE divide por la suma de los reales, que en una serie de plata nunca es cero.
  assert.equal(wape([0, 100, 200], [10, 110, 210]), 30 / 300)
  assert.equal(mae([0, 100], [10, 110]), 10)
})

test('la mediana móvil no la arrastra un pago extraordinario; la media sí', () => {
  const s = [100, 100, 100, 100, 100, 100, 5000]
  assert.equal(medianaMovil(s, 1, 7)[0], 100)
  assert.ok(mediaMovil(s, 1, 7)[0] > 700)
})

test('el estacional semanal proyecta cada día con SUS propios días', () => {
  // Una serie de caja no es lisa: los martes se paga y los domingos no entra nada. Promediar los
  // siete mezcla dos poblaciones y produce un número que no pasa ningún día.
  const s = []
  for (let i = 0; i < 28; i += 1) s.push(i % 7 === 0 ? 1000 : 0)
  const p = estacionalSemanal(s, 7, 4)
  assert.equal(p[0], 1000, 'el día que siempre tiene movimiento lo mantiene')
  assert.equal(p[1], 0, 'y el que nunca tiene, también')
})

test('la tendencia no explota con menos de tres puntos: cae al ingenuo', () => {
  assert.deepEqual(tendencia([5, 7], 2), [7, 7])
})

test('el backtest predice con lo que se sabía HASTA el corte, no con la serie entera', () => {
  // Medir sobre datos que el método ya vio no mide pronóstico: mide memoria. Una serie que sube
  // siempre tiene que darle ventaja a la tendencia sobre el ingenuo — si no, no está mirando el
  // futuro.
  const s = Array.from({ length: 60 }, (_, i) => i * 10)
  const r = backtest(s, { h: 5, minimo: 20 })
  assert.ok(r.tendencia.mae < r.naive.mae, 'sobre una recta perfecta la tendencia gana')
  assert.ok(r.naive.ventanas > 0)
})

test('sobre ruido puro NINGÚN método gana: y eso es el resultado, no un error', () => {
  let x = 1
  const ruido = Array.from({ length: 80 }, () => { x = (x * 1103515245 + 12345) % 2147483648; return (x / 2147483648 - 0.5) * 1000 })
  const r = backtest(ruido, { h: 7, minimo: 21 })
  // Con ruido, el WAPE de todos ronda o supera 1: el error es del tamaño de la serie.
  for (const v of Object.values(r)) assert.ok(v.wape > 0.7, 'sobre ruido, el error es del tamaño de la señal')
})

// ── LA REGLA QUE NO SE NEGOCIA ─────────────────────────────────────────────────────────────────

test('el pronóstico se SUMA al compromiso conocido, nunca lo reemplaza', () => {
  // Si hay un cheque emitido con fecha, eso es el piso. Un modelo que lo borrara convertiría una
  // certeza en una probabilidad.
  const c = combinar([-5000000, 0, -1200000], [-300000, -300000, -300000])
  assert.equal(c[0].comprometido, -5000000)
  assert.equal(c[0].esperado, -5300000)
  assert.equal(c[2].esperado, -1500000)
})

test('sin pronóstico, lo comprometido sigue entero', () => {
  const c = combinar([-5000000], [])
  assert.equal(c[0].esperado, -5000000)
  assert.equal(c[0].incertidumbre, 0)
})
