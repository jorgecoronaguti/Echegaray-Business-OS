// PR-4.1 · Tests del autenticador del endpoint (HMAC-o-token). Herméticos.
// Verifica el contrato: HMAC válida → aceptar; token de Mattermost válido →
// aceptar; cualquier otro caso → rechazar (fail-closed).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearAutenticadorEndpoint } from './auth-endpoint.mjs'
import { firmar } from '../../../communication-service/src/index.mjs'

const HMAC = 'secreto-hmac'
const TOKEN = 'token-mm-abcdef'

function conReloj() { let t = 1_000_000; return { ahora: () => t, avanzar: (ms) => { t += ms } } }

test('HMAC válida → aceptar (via hmac)', () => {
  const clk = conReloj()
  const a = crearAutenticadorEndpoint({ secretoHmac: HMAC, tokenMattermost: TOKEN, ahora: clk.ahora })
  const rawBody = 'text=hola'
  const r = a.verificar({ rawBody, firma: firmar(HMAC, rawBody, clk.ahora()), timestamp: clk.ahora(), ip: '10.0.0.5' })
  assert.equal(r.ok, true); assert.equal(r.via, 'hmac')
})

test('token de Mattermost válido → aceptar (via token)', () => {
  const clk = conReloj()
  const a = crearAutenticadorEndpoint({ secretoHmac: HMAC, tokenMattermost: TOKEN, ahora: clk.ahora })
  const r = a.verificar({ rawBody: 'text=hola', timestamp: clk.ahora(), token: TOKEN, ip: '10.0.0.5' })
  assert.equal(r.ok, true); assert.equal(r.via, 'token')
})

test('HMAC inválida PERO token válido → aceptar (el contrato lo permite)', () => {
  const clk = conReloj()
  const a = crearAutenticadorEndpoint({ secretoHmac: HMAC, tokenMattermost: TOKEN, ahora: clk.ahora })
  const r = a.verificar({ rawBody: 'x', firma: 'FALSA', timestamp: clk.ahora(), token: TOKEN })
  assert.equal(r.ok, true); assert.equal(r.via, 'token')
})

test('HMAC inválida y sin token → rechazar (firma_invalida)', () => {
  const clk = conReloj()
  const a = crearAutenticadorEndpoint({ secretoHmac: HMAC, ahora: clk.ahora }) // sólo hmac
  const r = a.verificar({ rawBody: 'x', firma: 'FALSA', timestamp: clk.ahora() })
  assert.equal(r.ok, false); assert.equal(r.motivo, 'firma_invalida')
})

test('token inválido → rechazar', () => {
  const clk = conReloj()
  const a = crearAutenticadorEndpoint({ tokenMattermost: TOKEN, ahora: clk.ahora })
  const r = a.verificar({ token: 'otro', timestamp: clk.ahora() })
  assert.equal(r.motivo, 'token_invalido')
})

test('token válido pero timestamp vencido → rechazar', () => {
  const clk = conReloj()
  const a = crearAutenticadorEndpoint({ tokenMattermost: TOKEN, ventanaSegundos: 300, ahora: clk.ahora })
  const r = a.verificar({ token: TOKEN, timestamp: clk.ahora() - 10 * 60_000 })
  assert.equal(r.motivo, 'timestamp_vencido')
})

test('token replay (mismo token+ts) → rechazar la segunda vez', () => {
  const clk = conReloj()
  const a = crearAutenticadorEndpoint({ tokenMattermost: TOKEN, ahora: clk.ahora })
  const req = { token: TOKEN, timestamp: clk.ahora() }
  assert.equal(a.verificar(req).ok, true)
  assert.equal(a.verificar(req).motivo, 'replay')
})

test('IP no permitida → rechazar (camino token)', () => {
  const clk = conReloj()
  const a = crearAutenticadorEndpoint({ tokenMattermost: TOKEN, allowlist: ['127.0.0.1'], ahora: clk.ahora })
  const r = a.verificar({ token: TOKEN, timestamp: clk.ahora(), ip: '8.8.8.8' })
  assert.equal(r.motivo, 'ip_no_permitida')
})

test('fail-closed: sin ningún método configurado → rechazar', () => {
  const a = crearAutenticadorEndpoint({})
  assert.equal(a.verificar({ token: 'x' }).ok, false)
  assert.equal(a.verificar({ token: 'x' }).motivo, 'sin_metodo_configurado')
})

test('sólo HMAC configurado, llega token → rechazar (no hay camino token)', () => {
  const clk = conReloj()
  const a = crearAutenticadorEndpoint({ secretoHmac: HMAC, ahora: clk.ahora })
  const r = a.verificar({ token: TOKEN, timestamp: clk.ahora() })
  assert.equal(r.ok, false); assert.equal(r.motivo, 'firma_faltante')
})
