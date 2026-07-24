import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyError } from '../engines/anthropic-api.mjs'
import { marcarSinCredito, marcarCerebroOk, _internos } from './estado-cerebro.mjs'

test('classifyError reconoce SIN CRÉDITO (402, o 400 con mensaje de saldo) y no lo reintenta', () => {
  assert.equal(classifyError({ status: 402 }).kind, 'credit')
  assert.equal(classifyError({ status: 402 }).hard, true)
  assert.equal(classifyError({ status: 400, message: 'Your credit balance is too low to access the API' }).kind, 'credit')
  assert.equal(classifyError({ status: 400, error: { message: 'insufficient funds' } }).kind, 'credit')
  // un 400 común NO es crédito
  assert.equal(classifyError({ status: 400, message: 'invalid request' }).kind, 'client')
  // 401 sigue siendo auth (credencial), no credit
  assert.equal(classifyError({ status: 401 }).kind, 'auth')
})

test('marcarCerebroOk es no-op cuando ya está OK (no escribe la base en el camino feliz)', async () => {
  _internos.setUltimoEstado(_internos.OK)
  const r = await marcarCerebroOk()
  assert.equal(r.cambio, false)
})

test('la transición sin_credito → ok se detecta (marcarCerebroOk reporta cambio)', async () => {
  // marcarSinCredito setea el estado en memoria aunque la base no esté disponible en el test
  await marcarSinCredito('402 test')
  assert.equal(_internos.getUltimoEstado(), _internos.SIN_CREDITO)
  const r = await marcarCerebroOk()
  assert.equal(r.cambio, true)
  assert.equal(_internos.getUltimoEstado(), _internos.OK)
})
