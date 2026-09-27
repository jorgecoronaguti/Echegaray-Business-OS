import test from 'node:test'
import assert from 'node:assert/strict'
import { tramosConRegla, reglaConARendir } from './compras-tipo-pago-a-rendir.mjs'
import { instrumentoDePago, FUERA_DE_CAJA } from '../lib/caja-canales.mjs'

const regla = { strict: true, showCustomUi: true, condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: 'Efectivo' }, { userEnteredValue: 'A rendir' }] } }
const dv = { values: [{ dataValidation: regla }] }

test('agrega el valor al final conservando strict y la lista; null si ya estaba', () => {
  const n = reglaConARendir(regla, 'Fuera de caja')
  assert.deepEqual(n.condition.values.map((v) => v.userEnteredValue), ['Efectivo', 'A rendir', 'Fuera de caja'])
  assert.equal(n.strict, true)
  assert.equal(reglaConARendir(n, 'Fuera de caja'), null)
  assert.equal(reglaConARendir(regla), null, 'sin --valor sigue siendo «A rendir», que ya estaba')
})

test('el texto del desplegable es el que caja-canales reconoce como fuera de caja', () => {
  assert.equal(instrumentoDePago('Fuera de caja'), FUERA_DE_CAJA)
})

test('tramos contiguos: un hueco sin regla parte el tramo', () => {
  const { tramos } = tramosConRegla([dv, dv, {}, dv], 4)
  assert.deepEqual(tramos, [{ inicio: 4, fin: 6 }, { inicio: 7, fin: 8 }])
})
