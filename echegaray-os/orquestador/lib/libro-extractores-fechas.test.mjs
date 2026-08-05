// LA ARITMÉTICA DEL SERIAL, EN FRÍO. Un día de corrimiento acá es plata en el tramo equivocado.
import test from 'node:test'
import assert from 'node:assert/strict'
import { serialDe, isoDeSerial, eomonth, finDeMes } from './libro-extractores-fechas.mjs'

test('el origen del serial es 30/12/1899, como en Sheets', () => {
  // Verificable a mano en el archivo: 01/01/2026 es el serial 46023.
  assert.equal(serialDe(2026, 1, 1), 46023)
  assert.equal(isoDeSerial(46023), '2026-01-01')
  // Y la ida y vuelta no pierde un día por el huso: San Juan es UTC−3 y el local restaría uno.
  for (const s of [0, 1, 45000, 46023, 46389]) assert.equal(serialDe(...isoDeSerial(s).split('-').map(Number)), s)
})

test('EOMONTH: diciembre + 1 mes es enero del año SIGUIENTE, no el mes 13', () => {
  assert.equal(isoDeSerial(eomonth(serialDe(2026, 12, 15), 0)), '2026-12-31')
  assert.equal(isoDeSerial(eomonth(serialDe(2026, 12, 15), 1)), '2027-01-31')
  assert.equal(isoDeSerial(eomonth(serialDe(2026, 1, 31), 0)), '2026-01-31')
})

test('finDeMes toma el bisiesto de verdad — febrero no siempre tiene 28', () => {
  assert.equal(isoDeSerial(finDeMes(2026, 2)), '2026-02-28')
  assert.equal(isoDeSerial(finDeMes(2028, 2)), '2028-02-29')
})
