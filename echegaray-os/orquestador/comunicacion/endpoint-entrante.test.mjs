// PR-4.1 · Tests del endpoint HTTP entrante (transporte). Herméticos: comm-service
// en memoria (RepositorioMemoria), sin PG ni red. Verifican SÓLO el transporte y
// la delegación a la seguridad del Communication Service.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearManejadorWebhook, _internos } from './endpoint-entrante.mjs'
import {
  CommunicationService, RepositorioMemoria, MattermostAdapter, FakeMattermost,
  VerificadorEntrante, firmar, crearLog, crearMetricas,
} from '../../../communication-service/src/index.mjs'

const SECRET = 'endpoint-secreto'

function armar({ secreto = SECRET, allowlist, clock, botUserId = 'bot_os' } = {}) {
  const cliente = new FakeMattermost()
  const repo = new RepositorioMemoria()
  const svc = new CommunicationService({
    repositorio: repo,
    verificadorEntrante: new VerificadorEntrante({ secreto, ventanaSegundos: 300, allowlist, ahora: clock }),
    log: crearLog(() => {}), metricas: crearMetricas(), ahora: clock,
  })
  svc.registrarAdapter(new MattermostAdapter({ cliente, botUserId, tokenEntrante: null }))
  const manejar = crearManejadorWebhook(svc, { maxBytes: 1024 })
  return { manejar, repo, svc }
}

// Construye un request de outgoing webhook (x-www-form-urlencoded) firmado.
function req(campos, { secreto = SECRET, ts = Date.now(), ip = '10.0.0.5', firmaOverride, ct = 'application/x-www-form-urlencoded' } = {}) {
  const rawBody = new URLSearchParams(campos).toString()
  const firma = firmaOverride ?? firmar(secreto, rawBody, ts)
  return {
    method: 'POST',
    headers: { 'content-type': ct, 'x-mm-signature': firma, 'x-mm-timestamp': String(ts) },
    rawBody, ip,
  }
}

const CAMPOS = { token: 't', channel_id: 'canal-1', user_id: 'u-rodrigo', user_name: 'rodrigo', post_id: 'post-9', text: '@os estado del sistema' }

test('1 · request válido ⇒ 202 aceptado', async () => {
  const { manejar } = armar()
  const r = await manejar(req(CAMPOS))
  assert.equal(r.status, 202)
  assert.equal(r.body.estado, 'aceptado')
})

test('2 · el RAW BODY se preserva exacto (el HMAC verifica sobre él)', async () => {
  const { manejar, repo } = armar()
  const p = req(CAMPOS)
  const r = await manejar(p)
  assert.equal(r.status, 202)
  // si el raw body se preservó, el evento entrante quedó con el texto y post exactos
  const ev = repo.eventos[0]
  assert.equal(ev.data.texto, '@os estado del sistema')
  assert.equal(ev.data.post_id, 'post-9')
})

test('3 · HMAC válida ⇒ 202', async () => {
  const { manejar } = armar()
  assert.equal((await manejar(req(CAMPOS))).status, 202)
})

test('4 · HMAC inválida ⇒ 401', async () => {
  const { manejar } = armar()
  const r = await manejar(req(CAMPOS, { firmaOverride: 'deadbeef' }))
  assert.equal(r.status, 401)
  assert.equal(r.body.motivo, 'firma_invalida')
})

test('5 · timestamp vencido ⇒ 401', async () => {
  const { manejar } = armar()
  const r = await manejar(req(CAMPOS, { ts: Date.now() - 10 * 60_000 }))
  assert.equal(r.status, 401)
  assert.equal(r.body.motivo, 'timestamp_vencido')
})

test('6 · replay (misma firma dos veces) ⇒ 202 luego 401', async () => {
  const { manejar } = armar()
  const p = req(CAMPOS)
  assert.equal((await manejar(p)).status, 202)
  const r2 = await manejar(p)
  assert.equal(r2.status, 401)
  assert.equal(r2.body.motivo, 'replay')
})

test('7 · IP no permitida ⇒ 401', async () => {
  const { manejar } = armar({ allowlist: ['203.0.113.7'] })
  const r = await manejar(req(CAMPOS, { ip: '8.8.8.8' }))
  assert.equal(r.status, 401)
  assert.equal(r.body.motivo, 'ip_no_permitida')
})

test('8 · body demasiado grande ⇒ 413', async () => {
  const { manejar } = armar()
  const grande = { ...CAMPOS, text: 'x'.repeat(2000) }
  const r = await manejar(req(grande))
  assert.equal(r.status, 413)
})

test('9 · Content-Type inválido ⇒ 415', async () => {
  const { manejar } = armar()
  const r = await manejar(req(CAMPOS, { ct: 'text/plain' }))
  assert.equal(r.status, 415)
})

test('10 · método no POST ⇒ 405', async () => {
  const { manejar } = armar()
  const r = await manejar({ method: 'GET', headers: {}, rawBody: '', ip: '10.0.0.5' })
  assert.equal(r.status, 405)
})

test('11 · secreto ausente (fail-closed) ⇒ 401', async () => {
  const { manejar } = armar({ secreto: null }) // sin secreto y sin modo dev
  const r = await manejar(req(CAMPOS, { secreto: 'cualquiera' }))
  assert.equal(r.status, 401)
  assert.equal(r.body.motivo, 'secreto_faltante')
})

test('12 · mensaje del propio bot ⇒ 200 ignorado (no loop)', async () => {
  const { manejar } = armar({ botUserId: 'bot_os' })
  const r = await manejar(req({ ...CAMPOS, user_id: 'bot_os' }))
  assert.equal(r.status, 200)
  assert.equal(r.body.estado, 'ignorado')
})

test('13 · preserva channel_id y user', async () => {
  const { manejar, repo } = armar()
  await manejar(req(CAMPOS))
  assert.equal(repo.eventos[0].data.channel_id, 'canal-1')
  assert.equal(repo.eventos[0].actor.display, 'rodrigo')
})

test('14 · preserva post_id (hilo/root)', async () => {
  const { manejar, repo } = armar()
  await manejar(req(CAMPOS))
  assert.equal(repo.eventos[0].data.post_id, 'post-9')
})

test('15 · no expone errores internos (500 genérico)', async () => {
  // con.recibir que explota → 500 sin filtrar el detalle
  const conRoto = { recibir: async () => { throw new Error('secreto=SUPERSECRETO interno') } }
  const manejar = crearManejadorWebhook(conRoto, { maxBytes: 1024 })
  const r = await manejar(req(CAMPOS))
  assert.equal(r.status, 500)
  assert.equal(r.body.error, 'internal_error')
  assert.equal(JSON.stringify(r.body).includes('SUPERSECRETO'), false)
})

test('16 · parsea x-www-form-urlencoded y JSON', () => {
  const form = _internos.parsearPayload('a=1&b=hola+mundo', 'application/x-www-form-urlencoded')
  assert.equal(form.b, 'hola mundo')
  const json = _internos.parsearPayload('{"a":1}', 'application/json')
  assert.equal(json.a, 1)
})
