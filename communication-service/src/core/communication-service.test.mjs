// Test de integración del Communication Service con FakeMattermost +
// RepositorioMemoria. Cubre los criterios del PR-3 y los ajustes bloqueantes:
// M2 (dedup atómico), M3 (inbox + DLQ entrante + replay), M4 (lease). Herméticos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CommunicationService } from './communication-service.mjs'
import { crearLog, crearMetricas } from './observabilidad.mjs'
import { RepositorioMemoria } from '../events/repositorio-memoria.mjs'
import { MattermostAdapter } from '../channels/mattermost/mattermost-adapter.mjs'
import { FakeMattermost } from '../channels/mattermost/mattermost-cliente.mjs'
import { TIPOS } from './eventos-canonicos.mjs'

function armar({ clock } = {}) {
  const cliente = new FakeMattermost()
  const repo = new RepositorioMemoria()
  const logs = []
  const svc = new CommunicationService({
    repositorio: repo,
    log: crearLog((r) => logs.push(r)),
    metricas: crearMetricas(),
    ahora: clock ?? (() => Date.now()),
  })
  svc.registrarAdapter(new MattermostAdapter({ cliente, botUserId: 'bot_os', tokenEntrante: 'secreto' }))
  return { svc, cliente, repo, logs }
}

test('SALIENTE end-to-end: emitir + procesarOutbox publica en Mattermost', async () => {
  const { svc, cliente } = armar()
  await svc.emitir({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: 'c-obras', texto: 'La Estrella: certificado aprobado' } })
  assert.equal(cliente.posts.length, 0, 'aún en el outbox')
  const resumen = await svc.procesarOutbox()
  assert.deepEqual(resumen, { intentados: 1, publicados: 1, reintentar: 0, dead: 0 })
  assert.equal(cliente.posts[0].message, 'La Estrella: certificado aprobado')
})

test('ENTRANTE end-to-end: recibir encola y procesarInbox corre el handler del OS', async () => {
  const { svc } = armar()
  const recibidos = []
  svc.registrarHandlerEntrante(TIPOS.MENSAJE_RECIBIDO, (ev) => { recibidos.push(ev) })
  const ev = await svc.recibir({ token: 'secreto', user_id: 'u1', user_name: 'rodrigo', channel_id: 'c1', post_id: 'p1', text: 'hola OS' })
  assert.equal(ev.type, TIPOS.MENSAJE_RECIBIDO)
  assert.equal(recibidos.length, 0, 'recibir NO despacha inline (M3)')
  const r = await svc.procesarInbox()
  assert.equal(r.procesados, 1)
  assert.equal(recibidos[0].data.texto, 'hola OS')
})

test('circuito completo: comando entrante → handler → respuesta saliente con hilo causal', async () => {
  const { svc, cliente } = armar()
  svc.registrarHandlerEntrante(TIPOS.COMANDO_INVOCADO, async (ev, { emitir }) => {
    await emitir({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: ev.data.channel_id, texto: 'pong' } })
  })
  const entrante = await svc.recibir({ token: 'secreto', user_id: 'u1', command: '/os', text: 'ping', channel_id: 'c1' })
  await svc.procesarInbox()
  await svc.procesarOutbox()
  assert.equal(cliente.posts[0].message, 'pong')
  assert.equal(cliente.posts[0].props.os_correlation_id, entrante.correlation_id)
})

// ── M1/M2 idempotencia ──
test('M1 saliente: dos mensajes idénticos (event_id distinto) publican DOS veces', async () => {
  const { svc, cliente } = armar()
  await svc.emitir({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: 'c1', texto: 'recordatorio' } })
  await svc.emitir({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: 'c1', texto: 'recordatorio' } })
  await svc.procesarOutbox()
  assert.equal(cliente.posts.length, 2, 'ya no se suprime un aviso legítimo repetido')
})

test('M1 saliente: reintento del mismo evento (misma clave) publica UNA sola vez', async () => {
  const { svc, cliente } = armar()
  const spec = { type: TIPOS.MENSAJE_PUBLICAR, idempotency_key: 'certif-4', data: { channel_id: 'c1', texto: 'una vez' } }
  await svc.emitir(spec)
  await svc.emitir(spec)
  await svc.procesarOutbox()
  assert.equal(cliente.posts.length, 1)
})

test('M2 entrante: dos entradas idénticas simultáneas despachan UNA sola vez (dedup atómico)', async () => {
  const { svc } = armar()
  let n = 0
  svc.registrarHandlerEntrante(TIPOS.MENSAJE_RECIBIDO, () => { n++ })
  const p = { token: 'secreto', user_id: 'u1', channel_id: 'c1', post_id: 'p1', text: 'hola' }
  // dos recibir concurrentes con la MISMA clave natural (post_id):
  const [a, b] = await Promise.all([svc.recibir(p), svc.recibir(p)])
  const insertados = [a, b].filter(Boolean).length
  assert.equal(insertados, 1, 'sólo una entrada se registró')
  await svc.procesarInbox()
  assert.equal(n, 1, 'el handler corrió una sola vez')
})

// ── M3 DLQ de ingesta + replay ──
test('M3: un handler que falla reintenta y, agotado, va a la DLQ entrante', async () => {
  let t = 0
  const { svc, repo } = armar({ clock: () => t })
  svc.registrarHandlerEntrante(TIPOS.MENSAJE_RECIBIDO, () => { throw new Error('OS caído') })
  await svc.recibir({ token: 'secreto', user_id: 'u1', channel_id: 'c1', post_id: 'p1', text: 'hola' })
  let r
  for (let i = 0; i < 6; i++) { r = await svc.procesarInbox(); t += 10 * 60_000 }
  assert.equal(repo.entrada.deadLetter.length, 1, 'terminó en DLQ, no se perdió')
  assert.equal(r.procesados, 0)
})

test('M3: replay manual de un evento entrante muerto lo reprocesa (idempotente)', async () => {
  let t = 0
  const { svc, repo } = armar({ clock: () => t })
  let falla = true
  const vistos = []
  svc.registrarHandlerEntrante(TIPOS.MENSAJE_RECIBIDO, (ev) => { if (falla) throw new Error('temporal'); vistos.push(ev.id) })
  const ev = await svc.recibir({ token: 'secreto', user_id: 'u1', channel_id: 'c1', post_id: 'p1', text: 'hola' })
  for (let i = 0; i < 6; i++) { await svc.procesarInbox(); t += 10 * 60_000 }
  assert.equal(repo.entrada.deadLetter.length, 1)
  falla = false
  assert.equal(await svc.reprocesarEntrada(ev.id), true)
  await svc.procesarInbox()
  assert.deepEqual(vistos, [ev.id], 'se reprocesó exactamente una vez')
})

// ── M4 lease ──
test('M4: dos workers no reclaman el mismo evento de salida', async () => {
  const { repo } = armar()
  await repo.salida.encolar({ id: 'e1', idempotency_key: 'k1', type: TIPOS.MENSAJE_PUBLICAR, data: {} })
  const w1 = repo.salida.reclamar('worker-A', 10, 30_000, 1000)
  const w2 = repo.salida.reclamar('worker-B', 10, 30_000, 1000)
  assert.equal(w1.length, 1)
  assert.equal(w2.length, 0, 'el segundo worker no ve el ítem ya reclamado (lease)')
})

test('M4: un lease vencido se recupera y el ítem vuelve a ser reclamable', async () => {
  const { repo } = armar()
  await repo.salida.encolar({ id: 'e1', idempotency_key: 'k1', type: TIPOS.MENSAJE_PUBLICAR, data: {} })
  repo.salida.reclamar('worker-muerto', 10, 5_000, 1000) // lease hasta 6000
  assert.equal(repo.salida.reclamar('worker-B', 10, 5_000, 2000).length, 0, 'lease vigente: nadie más lo toma')
  const recuperados = repo.salida.recuperarLeases(9999) // ya venció
  assert.equal(recuperados, 1)
  assert.equal(repo.salida.reclamar('worker-B', 10, 5_000, 9999).length, 1, 'tras recuperar, reclamable de nuevo')
})

test('REINTENTO saliente: un 503 deja pendiente; al reintentar, publica', async () => {
  let t = 0
  const { svc, cliente } = armar({ clock: () => t })
  cliente.fallarCon(503, 1)
  await svc.emitir({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: 'c1', texto: 'con reintento' } })
  const r1 = await svc.procesarOutbox()
  assert.equal(r1.reintentar, 1)
  assert.equal(cliente.posts.length, 0)
  t += 10_000
  const r2 = await svc.procesarOutbox()
  assert.equal(r2.publicados, 1)
})

test('DEAD LETTER saliente: un 400 permanente va a la DLQ sin reintentar', async () => {
  const { svc, cliente, repo } = armar()
  cliente.fallarCon(400, 10)
  await svc.emitir({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: 'c1', texto: 'error permanente' } })
  const r = await svc.procesarOutbox()
  assert.equal(r.dead, 1)
  assert.equal(repo.salida.deadLetter.length, 1)
  assert.equal(cliente.posts.length, 0)
})

test('sin handler, el evento entrante se procesa sin romper (procesado)', async () => {
  const { svc } = armar()
  await svc.recibir({ token: 'secreto', user_id: 'u1', channel_id: 'c1', post_id: 'p1', text: 'nadie escucha' })
  const r = await svc.procesarInbox()
  assert.equal(r.procesados, 1)
  assert.equal(r.dead, 0)
})
