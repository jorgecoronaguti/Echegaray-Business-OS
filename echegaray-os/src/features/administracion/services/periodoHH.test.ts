import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dentro, rotulo, ventanaDe } from './periodoHH.ts'

test('el día es un día', () => {
  assert.deepEqual(ventanaDe('dia', '2026-08-19'), { desde: '2026-08-19', hasta: '2026-08-19' })
})

test('la semana va de lunes a domingo', () => {
  // 19/08/2026 es miércoles.
  assert.deepEqual(ventanaDe('semana', '2026-08-19'), { desde: '2026-08-17', hasta: '2026-08-23' })
  // Un DOMINGO pertenece a la semana que arrancó el lunes anterior, no a la que empieza mañana.
  assert.deepEqual(ventanaDe('semana', '2026-08-23'), { desde: '2026-08-17', hasta: '2026-08-23' })
  assert.deepEqual(ventanaDe('semana', '2026-08-17'), { desde: '2026-08-17', hasta: '2026-08-23' })
})

test('la quincena es la de la empresa: 1-15 y 16-fin de mes', () => {
  assert.deepEqual(ventanaDe('quincena', '2026-08-07'), { desde: '2026-08-01', hasta: '2026-08-15' })
  assert.deepEqual(ventanaDe('quincena', '2026-08-16'), { desde: '2026-08-16', hasta: '2026-08-31' })
  assert.deepEqual(ventanaDe('quincena', '2026-08-31'), { desde: '2026-08-16', hasta: '2026-08-31' })
})

test('la segunda quincena termina el último día del mes, sea cual sea', () => {
  assert.equal(ventanaDe('quincena', '2026-02-20').hasta, '2026-02-28')
  assert.equal(ventanaDe('quincena', '2028-02-20').hasta, '2028-02-29', 'año bisiesto')
  assert.equal(ventanaDe('quincena', '2026-04-20').hasta, '2026-04-30')
})

test('el mes va del 1 al último día', () => {
  assert.deepEqual(ventanaDe('mes', '2026-08-19'), { desde: '2026-08-01', hasta: '2026-08-31' })
  assert.deepEqual(ventanaDe('mes', '2026-12-31'), { desde: '2026-12-01', hasta: '2026-12-31' })
})

test('la ventana se escribe con las fechas a la vista', () => {
  assert.equal(rotulo({ desde: '2026-08-01', hasta: '2026-08-15' }), '01/08 a 15/08')
})

test('los bordes de la ventana entran; una fila sin día, no', () => {
  const v = { desde: '2026-08-01', hasta: '2026-08-15' }
  assert.equal(dentro('2026-08-01', v), true)
  assert.equal(dentro('2026-08-15', v), true)
  assert.equal(dentro('2026-08-16', v), false)
  // Las filas legacy no tienen día: no se pueden contar en ningún período sin inventarles uno.
  assert.equal(dentro(null, v), false)
})
