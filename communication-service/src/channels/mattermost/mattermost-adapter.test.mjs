// Tests del Mattermost Adapter: mapeo canónico ⇄ Mattermost en ambas
// direcciones, contra FakeMattermost (0 red). Verifica que el adapter NO tiene
// lógica de negocio: sólo traduce.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MattermostAdapter } from './mattermost-adapter.mjs'
import { FakeMattermost } from './mattermost-cliente.mjs'
import { construirEvento, TIPOS } from '../../core/eventos-canonicos.mjs'

function armar() {
  const cliente = new FakeMattermost()
  const adapter = new MattermostAdapter({ cliente, botUserId: 'bot_os', tokenEntrante: 'secreto' })
  return { cliente, adapter }
}

test('el adapter declara plataforma y tipos salientes soportados', () => {
  const { adapter } = armar()
  assert.equal(adapter.plataforma, 'mattermost')
  assert.ok(adapter.tiposSalientesSoportados.includes(TIPOS.MENSAJE_PUBLICAR))
})

test('SALIENTE: publicar un mensaje crea un post con correlation_id en props', async () => {
  const { cliente, adapter } = armar()
  const ev = construirEvento({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: 'c1', texto: 'hola equipo' } })
  const r = await adapter.publicar(ev)
  assert.equal(r.ok, true)
  assert.equal(cliente.posts.length, 1)
  assert.equal(cliente.posts[0].message, 'hola equipo')
  assert.equal(cliente.posts[0].props.os_correlation_id, ev.correlation_id)
  assert.equal(r.platform_ref, cliente.posts[0].id)
})

test('SALIENTE: un mensaje con deep_link lo adjunta al texto', async () => {
  const { cliente, adapter } = armar()
  const ev = construirEvento({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: 'c1', texto: 'Revisá la obra', deep_link: 'https://app.ecsas.com.ar/control-obras/estrella' } })
  await adapter.publicar(ev)
  assert.match(cliente.posts[0].message, /app\.ecsas\.com\.ar\/control-obras\/estrella/)
})

test('SALIENTE: responder usa root_id (hilo)', async () => {
  const { cliente, adapter } = armar()
  const ev = construirEvento({ type: TIPOS.MENSAJE_RESPONDER, data: { channel_id: 'c1', texto: 'respuesta', root_id: 'post_raiz' } })
  await adapter.publicar(ev)
  assert.equal(cliente.posts[0].root_id, 'post_raiz')
})

test('SALIENTE: reacción agrega emoji con el user del bot por defecto', async () => {
  const { cliente, adapter } = armar()
  const ev = construirEvento({ type: TIPOS.REACCION_AGREGAR, data: { post_id: 'post_1', emoji: 'white_check_mark' } })
  const r = await adapter.publicar(ev)
  assert.equal(r.ok, true)
  assert.equal(cliente.reacciones[0].user_id, 'bot_os')
  assert.equal(cliente.reacciones[0].emoji_name, 'white_check_mark')
})

test('SALIENTE: falta channel_id ⇒ error permanente (no reintentable)', async () => {
  const { adapter } = armar()
  const ev = construirEvento({ type: TIPOS.MENSAJE_PUBLICAR, data: { texto: 'sin canal' } })
  const r = await adapter.publicar(ev)
  assert.equal(r.ok, false)
  assert.equal(r.reintentable, false)
})

test('SALIENTE: un 5xx del server se reporta como reintentable', async () => {
  const { cliente, adapter } = armar()
  cliente.fallarCon(503, 1)
  const ev = construirEvento({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: 'c1', texto: 'x' } })
  const r = await adapter.publicar(ev)
  assert.equal(r.ok, false)
  assert.equal(r.reintentable, true)
})

test('ENTRANTE: un mensaje de MM se convierte en evento canónico MENSAJE_RECIBIDO', () => {
  const { adapter } = armar()
  const ev = adapter.aCanonico({ token: 'secreto', user_id: 'u1', user_name: 'rodrigo', channel_id: 'c1', post_id: 'p1', text: 'cuánto hay en caja?' })
  assert.equal(ev.type, TIPOS.MENSAJE_RECIBIDO)
  assert.equal(ev.direccion, 'inbound')
  assert.equal(ev.actor.display, 'rodrigo')
  assert.equal(ev.data.texto, 'cuánto hay en caja?')
})

test('ENTRANTE: un slash command se convierte en COMANDO_INVOCADO con nombre y argumentos', () => {
  const { adapter } = armar()
  const ev = adapter.aCanonico({ token: 'secreto', user_id: 'u1', command: '/os', text: 'caja hoy', response_url: 'https://x', trigger_id: 't1' })
  assert.equal(ev.type, TIPOS.COMANDO_INVOCADO)
  assert.equal(ev.data.comando, 'os')
  assert.equal(ev.data.argumentos, 'caja hoy')
})

test('ENTRANTE: el eco del propio bot se ignora (evita loops)', () => {
  const { adapter } = armar()
  const ev = adapter.aCanonico({ token: 'secreto', user_id: 'bot_os', post_id: 'p2', text: 'aviso del OS' })
  assert.equal(ev, null)
})

test('ENTRANTE: un token de origen inválido se descarta', () => {
  const { adapter } = armar()
  const ev = adapter.aCanonico({ token: 'FALSO', user_id: 'u1', post_id: 'p3', text: 'intruso' })
  assert.equal(ev, null)
})

test('ENTRANTE: el mismo mensaje dos veces produce la misma idempotency_key', () => {
  const { adapter } = armar()
  const p = { token: 'secreto', user_id: 'u1', channel_id: 'c1', post_id: 'p1', text: 'hola' }
  assert.equal(adapter.aCanonico(p).idempotency_key, adapter.aCanonico(p).idempotency_key)
})
