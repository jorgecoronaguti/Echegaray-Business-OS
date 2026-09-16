import test from 'node:test'
import assert from 'node:assert/strict'
import { esTransitorio, statusDe, esperasDelCargador, ESPERAS_CARGADOR_MS_DEFAULT } from './google-transitorio.mjs'

test('el 504 con que murió el cargador el 15/09 es transitorio, venga como propiedad o en el texto', () => {
  const conStatus = Object.assign(new Error('google api 504: <html>Gateway Timeout'), { status: 504 })
  assert.equal(esTransitorio(conStatus), true)
  assert.equal(esTransitorio(new Error('google api 504: The server encountered a temporary error')), true)
  assert.equal(esTransitorio(new Error('google export pdf 503: backend error')), true)
  assert.equal(statusDe(new Error('google api 429: rate limit')), 429)
  assert.equal(esTransitorio({ message: 'google api 429: Quota exceeded' }), true)
})

test('lo que no cambia por esperar NO es transitorio', () => {
  assert.equal(esTransitorio(new Error('google api 403: The caller does not have permission')), false)
  assert.equal(esTransitorio(new Error('google api 400: Unable to parse range')), false)
  assert.equal(esTransitorio(new Error('falta el rótulo «Obra» en la fila 3 de Compras')), false)
  assert.equal(esTransitorio(new SyntaxError('Unexpected token')), false)
  assert.equal(esTransitorio(null), false)
  assert.equal(esTransitorio(undefined), false)
})

test('un corte de red antes de tener status también se reintenta', () => {
  assert.equal(esTransitorio(Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } })), true)
  assert.equal(esTransitorio(new Error('connect ETIMEDOUT 142.250.0.1:443')), true)
  assert.equal(esTransitorio(new Error('getaddrinfo EAI_AGAIN sheets.googleapis.com')), true)
})

test('las esperas salen del entorno o del default, y vacío significa sin reintento en proceso', () => {
  assert.deepEqual(esperasDelCargador({}), [...ESPERAS_CARGADOR_MS_DEFAULT])
  assert.deepEqual(esperasDelCargador({ ORQ_CARGADOR_ESPERAS_MS: '100, 200,x' }), [100, 200])
  assert.deepEqual(esperasDelCargador({ ORQ_CARGADOR_ESPERAS_MS: '' }), [])
})
