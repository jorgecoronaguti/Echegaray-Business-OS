// LA REGLA DE LA COLUMNA U, CASO POR CASO. Si alguien vuelve a contar Facturado como vencido, a
// medir contra la emisión o a tomar hoy en UTC, alguno de estos se pone rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoDeCobro, diasParaCobro, hoyEnSanJuan, diaISO } from './cobranza-estado-de-cobro.mjs'

const HOY = '2026-09-14'

test('Pendiente con Q ayer está vencida; con Q hoy, todavía a vencer', () => {
  assert.equal(estadoDeCobro('Pendiente', '2026-09-13', HOY), 'vencido')
  assert.equal(estadoDeCobro('Pendiente', '2026-09-14', HOY), 'a_vencer')
  assert.equal(estadoDeCobro('Pendiente', '2026-10-01', HOY), 'a_vencer')
})

test('Facturado con Q pasada NO está vencida: se muestra como su estado', () => {
  // Era la regla de `cliente_cuenta_corriente` y del portal hasta el 14/09/2026.
  assert.equal(estadoDeCobro('Facturado', '2026-09-13', HOY), 'otro')
  assert.equal(estadoDeCobro('Proyectado', '2020-01-01', HOY), 'otro')
  assert.equal(estadoDeCobro('CANCELAR', '2026-01-01', HOY), 'otro')
})

test('Cobrado manda aunque la Q sea futura', () => {
  assert.equal(estadoDeCobro('Cobrado', '2026-12-31', HOY), 'cobrado')
})

test('sin Q o sin estado no se afirma vencido', () => {
  assert.equal(estadoDeCobro('Pendiente', null, HOY), 'otro')
  assert.equal(estadoDeCobro(null, '2026-01-01', HOY), 'otro')
})

test('mayúsculas como el `=` del Sheet; espacios no', () => {
  assert.equal(estadoDeCobro('PENDIENTE', '2026-09-13', HOY), 'vencido')
  assert.equal(estadoDeCobro('Pendiente ', '2026-09-13', HOY), 'otro')
})

test('la emisión no interviene: una fila emitida hace un año con Q futura no está vencida', () => {
  // El reloj anterior (emisión + 30) la daba vencida. La firma ni siquiera recibe la emisión.
  assert.equal(estadoDeCobro.length, 3)
  assert.equal(estadoDeCobro('Pendiente', '2026-09-20', HOY), 'a_vencer')
})

test('hoy es hoy en San Juan: a las 22:00 del 13 en Argentina, UTC ya dice 14', () => {
  const ahora = new Date('2026-09-14T01:00:00Z')
  assert.equal(hoyEnSanJuan(ahora), '2026-09-13')
  // Con hoy en UTC esta fila salía vencida tres horas antes de que termine su día.
  assert.equal(estadoDeCobro('Pendiente', '2026-09-13', ahora), 'a_vencer')
  assert.equal(diaISO(ahora), '2026-09-13')
})

test('los días son Q − hoy: negativo es atraso', () => {
  assert.equal(diasParaCobro('2026-09-10', HOY), -4)
  assert.equal(diasParaCobro('2026-09-14', HOY), 0)
  assert.equal(diasParaCobro('2026-09-20', HOY), 6)
  assert.equal(diasParaCobro(null, HOY), null)
})
