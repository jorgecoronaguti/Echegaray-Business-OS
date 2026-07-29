// Tests de la seguridad del borde entrante (M7). Herméticos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { VerificadorEntrante, MOTIVO, firmar } from './seguridad-entrante.mjs'

const SECRETO = 'supersecreto-webhook'

function armar(extra = {}) {
  let t = 1_000_000
  const v = new VerificadorEntrante({ secreto: SECRETO, ventanaSegundos: 300, ahora: () => t, ...extra })
  return { v, avanzar: (ms) => { t += ms }, ahora: () => t }
}

function req(v, rawBody, { ts, ip } = {}) {
  const timestamp = ts ?? v.ahora()
  return { rawBody, firma: firmar(SECRETO, rawBody, timestamp), timestamp, ip }
}

test('firma válida ⇒ ok', () => {
  const { v, ahora } = armar()
  const r = v.verificar({ rawBody: '{"text":"hola"}', firma: firmar(SECRETO, '{"text":"hola"}', ahora()), timestamp: ahora() })
  assert.equal(r.ok, true)
  assert.equal(r.motivo, MOTIVO.OK)
})

test('firma inválida ⇒ rechazo', () => {
  const { v, ahora } = armar()
  const r = v.verificar({ rawBody: 'x', firma: 'deadbeef', timestamp: ahora() })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO.FIRMA_INVALIDA)
})

test('body alterado ⇒ firma inválida (la firma es del cuerpo bruto)', () => {
  const { v, ahora } = armar()
  const firma = firmar(SECRETO, '{"monto":100}', ahora())
  const r = v.verificar({ rawBody: '{"monto":999999}', firma, timestamp: ahora() })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO.FIRMA_INVALIDA)
})

test('timestamp vencido ⇒ rechazo', () => {
  const { v, ahora } = armar()
  const viejo = ahora() - 10 * 60_000 // 10 min atrás, ventana 5 min
  const r = v.verificar({ rawBody: 'x', firma: firmar(SECRETO, 'x', viejo), timestamp: viejo })
  assert.equal(r.motivo, MOTIVO.TIMESTAMP_VENCIDO)
})

test('replay ⇒ la misma firma no se acepta dos veces', () => {
  const { v } = armar()
  const r1 = v.verificar(req(v, 'payload'))
  assert.equal(r1.ok, true)
  const r2 = v.verificar(req(v, 'payload')) // misma firma (mismo ts+body)
  assert.equal(r2.ok, false)
  assert.equal(r2.motivo, MOTIVO.REPLAY)
})

test('IP fuera de la allowlist ⇒ rechazo; dentro ⇒ ok', () => {
  const { v, ahora } = armar({ allowlist: ['10.0.', '203.0.113.7'] })
  const bien = v.verificar({ ...req(v, 'x'), ip: '10.0.0.5' })
  assert.equal(bien.ok, true)
  const mal = v.verificar({ ...req(v, 'y'), ip: '8.8.8.8' })
  assert.equal(mal.motivo, MOTIVO.IP_NO_PERMITIDA)
})

test('fail-closed: sin secreto y sin modo dev ⇒ secreto_faltante', () => {
  const v = new VerificadorEntrante({})
  assert.equal(v.verificar({ rawBody: 'x' }).motivo, MOTIVO.SECRETO_FALTANTE)
})

test('modo dev explícito sin secreto ⇒ ok (desarrollo local)', () => {
  const v = new VerificadorEntrante({ modoDev: true })
  assert.equal(v.verificar({ rawBody: 'x' }).ok, true)
})

test('firma faltante ⇒ rechazo', () => {
  const { v, ahora } = armar()
  assert.equal(v.verificar({ rawBody: 'x', timestamp: ahora() }).motivo, MOTIVO.FIRMA_FALTANTE)
})

test('comparación en tiempo constante: firmas de distinta longitud ⇒ inválida (no rompe)', () => {
  const { v, ahora } = armar()
  const r = v.verificar({ rawBody: 'x', firma: 'ab', timestamp: ahora() })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO.FIRMA_INVALIDA)
})
