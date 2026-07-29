// Test de integración del Communication Service: prueba el circuito completo y
// desacoplado, con FakeMattermost + RepositorioMemoria. Cubre los 5 criterios de
// éxito del PR-3: OS emite evento → servicio → adapter publica; y MM → adapter →
// evento canónico → handler del OS. Herméticos, 0 red, 0 DB.
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

test('SALIENTE end-to-end: el OS emite un evento y procesarOutbox lo publica en Mattermost', async () => {
  const { svc, cliente } = armar()
  await svc.emitir({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: 'c-obras', texto: 'La Estrella: certificado aprobado' } })
  assert.equal(cliente.posts.length, 0, 'aún no se publicó: está en el outbox')
  const resumen = await svc.procesarOutbox()
  assert.deepEqual(resumen, { intentados: 1, publicados: 1, reintentar: 0, dead: 0 })
  assert.equal(cliente.posts.length, 1)
  assert.equal(cliente.posts[0].message, 'La Estrella: certificado aprobado')
})

test('ENTRANTE end-to-end: un mensaje de MM llega como evento canónico al handler del OS', async () => {
  const { svc } = armar()
  const recibidos = []
  svc.registrarHandlerEntrante(TIPOS.MENSAJE_RECIBIDO, (ev) => { recibidos.push(ev) })
  const ev = await svc.recibir({ token: 'secreto', user_id: 'u1', user_name: 'rodrigo', channel_id: 'c1', post_id: 'p1', text: 'hola OS' })
  assert.equal(ev.type, TIPOS.MENSAJE_RECIBIDO)
  assert.equal(recibidos.length, 1)
  assert.equal(recibidos[0].data.texto, 'hola OS')
})

test('circuito completo: un comando entrante hace que el OS emita una respuesta saliente', async () => {
  const { svc, cliente } = armar()
  // El handler del OS (en PR-4 será el Work Fabric) responde emitiendo un evento saliente.
  svc.registrarHandlerEntrante(TIPOS.COMANDO_INVOCADO, async (ev, { emitir }) => {
    await emitir({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: ev.data.channel_id, texto: 'pong' } })
  })
  const entrante = await svc.recibir({ token: 'secreto', user_id: 'u1', command: '/os', text: 'ping', channel_id: 'c1' })
  await svc.procesarOutbox()
  assert.equal(cliente.posts.length, 1)
  assert.equal(cliente.posts[0].message, 'pong')
  // La respuesta hereda el hilo causal del comando (auditable de punta a punta).
  assert.equal(cliente.posts[0].props.os_correlation_id, entrante.correlation_id)
})

test('IDEMPOTENCIA saliente: emitir el mismo evento dos veces publica una sola vez', async () => {
  const { svc, cliente } = armar()
  const spec = { type: TIPOS.MENSAJE_PUBLICAR, idempotency_key: 'fijo-1', data: { channel_id: 'c1', texto: 'una vez' } }
  await svc.emitir(spec)
  await svc.emitir(spec) // duplicado
  await svc.procesarOutbox()
  assert.equal(cliente.posts.length, 1, 'el duplicado no generó un segundo post')
})

test('IDEMPOTENCIA entrante: el mismo mensaje entrante no dispara el handler dos veces', async () => {
  const { svc } = armar()
  let n = 0
  svc.registrarHandlerEntrante(TIPOS.MENSAJE_RECIBIDO, () => { n++ })
  const p = { token: 'secreto', user_id: 'u1', channel_id: 'c1', post_id: 'p1', text: 'hola' }
  await svc.recibir(p)
  const segundo = await svc.recibir(p)
  assert.equal(segundo, null, 'el duplicado se descarta')
  assert.equal(n, 1)
})

test('REINTENTO: un 503 deja el evento pendiente; al reintentar, se publica', async () => {
  let t = 0
  const { svc, cliente } = armar({ clock: () => t })
  cliente.fallarCon(503, 1) // el primer intento falla
  await svc.emitir({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: 'c1', texto: 'con reintento' } })
  const r1 = await svc.procesarOutbox()
  assert.equal(r1.reintentar, 1)
  assert.equal(cliente.posts.length, 0)
  t += 10_000 // avanza el reloj más allá del backoff
  const r2 = await svc.procesarOutbox()
  assert.equal(r2.publicados, 1)
  assert.equal(cliente.posts.length, 1)
})

test('DEAD LETTER: un 400 permanente manda el evento a la DLQ sin reintentar', async () => {
  const { svc, cliente, repo } = armar()
  cliente.fallarCon(400, 10)
  await svc.emitir({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: 'c1', texto: 'error permanente' } })
  const r = await svc.procesarOutbox()
  assert.equal(r.dead, 1)
  assert.equal(repo.deadLetter.length, 1)
  assert.equal(cliente.posts.length, 0)
})

test('DESACOPLE: sin handler registrado, el evento entrante se audita sin romper', async () => {
  const { svc, repo } = armar()
  const ev = await svc.recibir({ token: 'secreto', user_id: 'u1', channel_id: 'c1', post_id: 'p1', text: 'nadie escucha' })
  assert.ok(ev, 'se convirtió y auditó igual')
  assert.equal(repo.eventos.length, 1)
})

test('un tipo saliente no soportado por el adapter va a DLQ (permanente), no a un loop', async () => {
  const { svc, repo } = armar()
  // MIEMBRO_UNIDO es entrante; forzamos un saliente "raro" que el adapter no soporta
  // usando REACCION en un adapter que sí lo soporta NO sirve; usamos un stub:
  await svc.emitir({ type: TIPOS.ARCHIVO_PUBLICAR, data: { channel_id: 'c1', texto: 'x', platform: 'inexistente' } })
  const r = await svc.procesarOutbox()
  assert.equal(r.dead, 1, 'sin adapter para esa plataforma ⇒ permanente ⇒ DLQ')
  assert.equal(repo.deadLetter.length, 1)
})
