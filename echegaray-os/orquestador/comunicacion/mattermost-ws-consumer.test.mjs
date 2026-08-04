// PR-4.2 · Tests herméticos del consumidor WebSocket. Sin red, sin DB.
// Verifican: parser de eventos WS, guardas (eco propio / mención / DM / sistema),
// dedup por post.id, mapeo → canónico → inbox (comm-service en memoria), y el ciclo
// de conexión (auth challenge, hello, reconexión con backoff, shutdown limpio) con
// un WebSocket FALSO inyectado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parsearPosted, esRelevante, mapearAPayload, Deduplicador, crearConsumidorWS, AREAS_DE_ADJUNTOS,
} from './mattermost-ws-consumer.mjs'
import {
  CommunicationService, RepositorioMemoria, MattermostAdapter, FakeMattermost,
  crearLog, crearMetricas,
} from '../../../communication-service/src/index.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const BOT = 'bot_os'

// WebSocket falso: registra frames enviados y expone disparadores de test.
class FakeWS {
  constructor(url) { this.url = url; this.sent = []; this.cerrado = false; FakeWS.instancias.push(this); FakeWS.ultima = this }
  send(s) { this.sent.push(s) }
  close() { this.cerrado = true; this.onclose?.({ code: 1000 }) }
  abrir() { this.onopen?.() }
  emitir(obj) { this.onmessage?.({ data: typeof obj === 'string' ? obj : JSON.stringify(obj) }) }
  cerrarRemoto(code = 1006) { this.onclose?.({ code }) }
}
FakeWS.instancias = []
FakeWS.ultima = null
const resetWS = () => { FakeWS.instancias = []; FakeWS.ultima = null }

// Evento `posted` crudo de Mattermost (data.post y data.mentions son strings JSON).
function posted({ id = 'p1', user_id = 'u-jorge', message = '@os estado del sistema', channel_id = 'c-priv', root_id = '', type = '', channel_type = 'P', mentions = [BOT], sender_name = '@jorge', channel_name = 'os-pruebas', team_id = 't1' } = {}) {
  return {
    event: 'posted',
    data: {
      post: JSON.stringify({ id, user_id, message, channel_id, root_id, type }),
      channel_type, channel_name, team_id, sender_name,
      mentions: JSON.stringify(mentions),
    },
    broadcast: { channel_id },
    seq: 7,
  }
}

// ── parser ──────────────────────────────────────────────────────────────────
test('parsearPosted · evento posted válido', () => {
  const info = parsearPosted(posted())
  assert.equal(info.post.id, 'p1')
  assert.equal(info.channelType, 'P')
  assert.equal(info.senderName, 'jorge') // sin @
  assert.deepEqual(info.mentions, [BOT])
})

test('parsearPosted · no-posted (hello/typing/health) ⇒ null', () => {
  assert.equal(parsearPosted({ event: 'hello', data: {} }), null)
  assert.equal(parsearPosted({ event: 'typing', data: {} }), null)
  assert.equal(parsearPosted('no-json'), null)
  assert.equal(parsearPosted({ event: 'posted', data: { post: '{malformado' } }), null)
})

// ── guardas ───────────────────────────────────────────────────────────────
test('guarda · eco del propio bot ⇒ irrelevante', () => {
  assert.equal(esRelevante(parsearPosted(posted({ user_id: BOT })), { botUserId: BOT }), false)
})
test('guarda · mención directa por user_id ⇒ relevante', () => {
  assert.equal(esRelevante(parsearPosted(posted({ mentions: [BOT] })), { botUserId: BOT }), true)
})
test('guarda · mención por texto @os ⇒ relevante (sin mentions)', () => {
  assert.equal(esRelevante(parsearPosted(posted({ mentions: [], message: 'hola @os' })), { botUserId: BOT, botUsername: 'os' }), true)
})
test('guarda · privado sin mención ⇒ irrelevante', () => {
  assert.equal(esRelevante(parsearPosted(posted({ mentions: [], message: 'charla interna' })), { botUserId: BOT }), false)
})
test('guarda · DM (channel_type D) sin mención ⇒ relevante', () => {
  assert.equal(esRelevante(parsearPosted(posted({ channel_type: 'D', mentions: [], message: 'hola' })), { botUserId: BOT }), true)
})
test('guarda · post de sistema (join/leave) ⇒ irrelevante', () => {
  assert.equal(esRelevante(parsearPosted(posted({ type: 'system_join_channel', mentions: [BOT] })), { botUserId: BOT }), false)
})

// ── dedup ───────────────────────────────────────────────────────────────────
test('Deduplicador · marca y detecta; respeta el tope', () => {
  const d = new Deduplicador(2)
  d.marcar('a'); assert.equal(d.visto('a'), true)
  d.marcar('b'); d.marcar('c') // desaloja 'a'
  assert.equal(d.visto('a'), false)
  assert.equal(d.visto('c'), true)
})

// ── mapeo → canónico → inbox (comm-service en memoria) ──────────────────────
function armarCon() {
  const cliente = new FakeMattermost()
  const repo = new RepositorioMemoria()
  const svc = new CommunicationService({ repositorio: repo, log: crearLog(() => {}), metricas: crearMetricas() }) // SIN verificador
  svc.registrarAdapter(new MattermostAdapter({ cliente, botUserId: BOT, tokenEntrante: null }))
  return { con: { recibir: (p, ctx) => svc.recibir(p, ctx) }, repo }
}

test('mapeo · un posted relevante ⇒ evento en inbox con channel/post/texto', async () => {
  const { con, repo } = armarCon()
  const c = crearConsumidorWS({ con, wsUrl: 'ws://x/api/v4/websocket', token: 't', botUserId: BOT, log: crearLog(() => {}) })
  const r = await c.manejarMensaje(posted({ id: 'p9', channel_id: 'c-priv', message: '@os estado del sistema' }))
  assert.equal(r.estado, 'aceptado')
  assert.equal(repo.eventos.length, 1)
  assert.equal(repo.eventos[0].data.channel_id, 'c-priv')
  assert.equal(repo.eventos[0].data.post_id, 'p9')
  assert.equal(repo.eventos[0].data.texto, '@os estado del sistema')
  assert.equal(repo.eventos[0].actor.display, 'jorge')
})

test('mapeo · post_id = post.id real (dedup e hilo correctos)', () => {
  const p = mapearAPayload({ id: 'P123', user_id: 'u', channel_id: 'c', message: 'x', root_id: '' }, {})
  assert.equal(p.post_id, 'P123')
  assert.equal(p.root_id, 'P123') // top-level ⇒ raíz = el propio post
  const p2 = mapearAPayload({ id: 'P2', channel_id: 'c', message: 'x', root_id: 'ROOT' }, {})
  assert.equal(p2.root_id, 'ROOT') // en hilo ⇒ raíz preservada
})

test('flujo · propio bot no genera evento; sin mención no genera evento', async () => {
  const { con, repo } = armarCon()
  const c = crearConsumidorWS({ con, wsUrl: 'ws://x', token: 't', botUserId: BOT, log: crearLog(() => {}) })
  assert.equal((await c.manejarMensaje(posted({ user_id: BOT }))).estado, 'ignorado')
  assert.equal((await c.manejarMensaje(posted({ mentions: [], message: 'charla' }))).estado, 'ignorado')
  assert.equal(repo.eventos.length, 0)
})

test('flujo · duplicado por post.id no genera segundo evento', async () => {
  const { con, repo } = armarCon()
  const c = crearConsumidorWS({ con, wsUrl: 'ws://x', token: 't', botUserId: BOT, log: crearLog(() => {}) })
  assert.equal((await c.manejarMensaje(posted({ id: 'dup1' }))).estado, 'aceptado')
  assert.equal((await c.manejarMensaje(posted({ id: 'dup1' }))).estado, 'duplicado')
  assert.equal(repo.eventos.length, 1)
})

test('flujo · no-posted (hello) no genera evento', async () => {
  const { con, repo } = armarCon()
  const c = crearConsumidorWS({ con, wsUrl: 'ws://x', token: 't', botUserId: BOT, log: crearLog(() => {}) })
  assert.equal((await c.manejarMensaje({ event: 'hello', data: {} })).estado, 'no-posted')
  assert.equal(repo.eventos.length, 0)
})

// ── ciclo de conexión (WebSocket falso) ─────────────────────────────────────
test('conexión · al abrir envía authentication_challenge con el token', () => {
  resetWS()
  const { con } = armarCon()
  const c = crearConsumidorWS({ con, wsUrl: 'ws://x/api/v4/websocket', token: 'TOKEN123', botUserId: BOT, WebSocketImpl: FakeWS, log: crearLog(() => {}) })
  c.conectar()
  FakeWS.ultima.abrir()
  const frame = JSON.parse(FakeWS.ultima.sent[0])
  assert.equal(frame.action, 'authentication_challenge')
  assert.equal(frame.data.token, 'TOKEN123')
  c.cerrar()
})

test('conexión · hello marca autenticado', () => {
  resetWS()
  const { con } = armarCon()
  const c = crearConsumidorWS({ con, wsUrl: 'ws://x', token: 't', botUserId: BOT, WebSocketImpl: FakeWS, log: crearLog(() => {}) })
  c.conectar(); FakeWS.ultima.abrir(); FakeWS.ultima.emitir({ event: 'hello', data: {} })
  assert.equal(c._estado().autenticado, true)
  c.cerrar()
})

test('conexión · cierre remoto ⇒ reconecta con backoff (nueva instancia)', async () => {
  resetWS()
  const { con } = armarCon()
  const c = crearConsumidorWS({ con, wsUrl: 'ws://x', token: 't', botUserId: BOT, WebSocketImpl: FakeWS, backoffBaseMs: 5, backoffMaxMs: 20, log: crearLog(() => {}) })
  c.conectar()
  assert.equal(FakeWS.instancias.length, 1)
  FakeWS.ultima.cerrarRemoto(1006)
  await sleep(40)
  assert.ok(FakeWS.instancias.length >= 2, 'debió crear una nueva conexión')
  c.cerrar()
})

test('conexión · shutdown limpio ⇒ no reconecta', async () => {
  resetWS()
  const { con } = armarCon()
  const c = crearConsumidorWS({ con, wsUrl: 'ws://x', token: 't', botUserId: BOT, WebSocketImpl: FakeWS, backoffBaseMs: 5, log: crearLog(() => {}) })
  c.conectar()
  c.cerrar()
  const n = FakeWS.instancias.length
  FakeWS.ultima.cerrarRemoto(1006) // ya cerrado: no debe reagendar
  await sleep(30)
  assert.equal(FakeWS.instancias.length, n)
  assert.equal(c._estado().cerrado, true)
})

// ── EL FRAME REAL DEL CANAL DE COMPROBANTES ─────────────────────────────────
//
// Este bloque NO es un frame inventado: es la captura literal de un evento `posted` del Mattermost
// vivo, del canal que el dueño ve como "Comprobantes-gastos", con un PDF real adjunto.
//
// Lo que enseñó, y por lo que existe este test: Mattermost manda en `channel_name` el SLUG del
// canal (`compras`), NO su nombre visible (`Comprobantes-gastos`). Configurar el nombre que se lee
// en la pantalla hacía que `esRelevante` devolviera false y la foto no llegara a NADIE — con toda la
// capacidad construida del otro lado. Los tests con canal de mentira pasaban igual, porque el frame
// falso traía el nombre que el código esperaba: la prueba se estaba dando la razón a sí misma.
const FRAME_REAL_COMPROBANTES = {
  event: 'posted',
  data: {
    channel_display_name: 'Comprobantes-gastos',
    channel_name: 'compras', // ← el SLUG, que es lo único que viaja
    channel_type: 'O',
    post: JSON.stringify({
      id: 'x5o3tjus5bfoxq1cuqyqx3j9po',
      channel_id: 'ataehrdpmfyctqyjcfz5rs9jka',
      user_id: 'persona_real',
      message: '',
      type: '',
      file_ids: ['9e5yrxbrctg6fjsx5u3nux81zo'],
    }),
    mentions: '[]',
  },
}

test('el frame REAL del canal de comprobantes entra por su SLUG, no por el nombre visible', () => {
  const info = parsearPosted(FRAME_REAL_COMPROBANTES)
  assert.equal(info.channelName, 'compras')
  assert.deepEqual(info.post.file_ids, ['9e5yrxbrctg6fjsx5u3nux81zo'])

  // Configurar el nombre VISIBLE no alcanza: es exactamente el defecto que se encontró en vivo.
  assert.equal(
    esRelevante(info, { botUserId: BOT, canalesAdjuntos: new Set(['comprobantes-gastos']) }),
    false,
    'el nombre visible del canal no matchea el slug que manda Mattermost')

  // Por slug, entra.
  assert.equal(esRelevante(info, { botUserId: BOT, canalesAdjuntos: new Set(['compras']) }), true)
  // Y por channel_id también, que es lo que sobrevive a un renombre del canal.
  assert.equal(
    esRelevante(info, { botUserId: BOT, canalesAdjuntos: new Set(['ataehrdpmfyctqyjcfz5rs9jka']) }),
    true)
})

test('un mensaje SIN adjuntos en el canal de comprobantes no se lo roba a nadie', () => {
  const crudo = JSON.parse(JSON.stringify(FRAME_REAL_COMPROBANTES))
  const post = JSON.parse(crudo.data.post)
  post.file_ids = []
  post.message = 'che, ¿cuánto le debemos a Cemento SA?'
  crudo.data.post = JSON.stringify(post)
  const info = parsearPosted(crudo)
  assert.equal(esRelevante(info, { botUserId: BOT, canalesAdjuntos: new Set(['compras']) }), false)
})

test('el eco del propio bot con adjuntos no reentra (anti-loop)', () => {
  const crudo = JSON.parse(JSON.stringify(FRAME_REAL_COMPROBANTES))
  const post = JSON.parse(crudo.data.post)
  post.user_id = BOT
  crudo.data.post = JSON.stringify(post)
  const info = parsearPosted(crudo)
  assert.equal(esRelevante(info, { botUserId: BOT, canalesAdjuntos: new Set(['compras']) }), false)
})

// ── EL PREFILTRO PREGUNTA POR EL BINDING, NO SÓLO POR EL .env ───────────────
//
// El pedido del dueño es que estar en el canal alcance. Eso se rompía acá y en silencio: atar un
// canal nuevo al área `compras` en `comunicacion.canales_area` habilitaba la carga de verdad —la
// guarda pregunta por el binding— pero la foto mandada a ese canal no llegaba ni a crear un evento,
// porque este prefiltro miraba una lista de slugs del entorno. Nadie recibía un rechazo: no pasaba
// nada, que es la peor forma de fallar.

/** `port` de mentira que sólo sabe contestar el binding de canales por área. */
function portBinding({ filas = [], explota = false } = {}) {
  let veces = 0
  return {
    get veces() { return veces },
    async query(sql) {
      veces++
      if (explota) throw new Error('base caída (simulado)')
      return { rows: /canales_area/.test(sql) ? filas : [] }
    },
  }
}

/** El frame real, pero mandado a OTRO canal: uno que existe en el binding y no en el entorno. */
function frameEnCanal({ channelName, channelId }) {
  const crudo = JSON.parse(JSON.stringify(FRAME_REAL_COMPROBANTES))
  const post = JSON.parse(crudo.data.post)
  post.channel_id = channelId
  post.id = `p-${channelId}`
  crudo.data.post = JSON.stringify(post)
  crudo.data.channel_name = channelName
  crudo.broadcast = { channel_id: channelId }
  return crudo
}

test('un canal atado al área en el binding ingresa adjuntos aunque no esté en MM_CANALES_ADJUNTOS', async () => {
  const { con, repo } = armarCon()
  const port = portBinding({ filas: [{ channel_id: 'c-obra-nueva', canal_nombre: 'gastos-obra-nueva' }] })
  const c = crearConsumidorWS({
    con, wsUrl: 'ws://x', token: 't', botUserId: BOT, log: crearLog(() => {}), port,
    canalesAdjuntos: new Set(['compras']), // el entorno NO conoce el canal nuevo
  })
  const r = await c.manejarMensaje(frameEnCanal({ channelName: 'gastos-obra-nueva', channelId: 'c-obra-nueva' }))
  assert.equal(r.estado, 'aceptado', 'la foto del canal atado al área tiene que entrar')
  assert.equal(repo.eventos.length, 1)
})

test('el binding SUMA y nunca resta: lo del entorno sigue entrando', async () => {
  const { con } = armarCon()
  const port = portBinding({ filas: [{ channel_id: 'c-obra-nueva', canal_nombre: 'gastos-obra-nueva' }] })
  const c = crearConsumidorWS({
    con, wsUrl: 'ws://x', token: 't', botUserId: BOT, log: crearLog(() => {}), port,
    canalesAdjuntos: new Set(['compras']),
  })
  assert.equal((await c.manejarMensaje(FRAME_REAL_COMPROBANTES)).estado, 'aceptado')
})

test('un canal que NO está ni en el entorno ni en el binding sigue sin entrar', async () => {
  const { con, repo } = armarCon()
  const port = portBinding({ filas: [{ channel_id: 'c-obra-nueva', canal_nombre: 'gastos-obra-nueva' }] })
  const c = crearConsumidorWS({
    con, wsUrl: 'ws://x', token: 't', botUserId: BOT, log: crearLog(() => {}), port,
    canalesAdjuntos: new Set(['compras']),
  })
  const r = await c.manejarMensaje(frameEnCanal({ channelName: 'chismes', channelId: 'c-chismes' }))
  assert.equal(r.estado, 'ignorado')
  assert.equal(repo.eventos.length, 0)
})

test('si la base no contesta, la ingesta NO se apaga: sigue valiendo lo del entorno', async () => {
  const { con } = armarCon()
  const c = crearConsumidorWS({
    con, wsUrl: 'ws://x', token: 't', botUserId: BOT, log: crearLog(() => {}), port: portBinding({ explota: true }),
    canalesAdjuntos: new Set(['compras']),
  })
  assert.equal((await c.manejarMensaje(FRAME_REAL_COMPROBANTES)).estado, 'aceptado')
})

test('el binding se relee por minuto, no por mensaje', async () => {
  const { con } = armarCon()
  const port = portBinding({ filas: [{ channel_id: 'c-obra-nueva', canal_nombre: 'gastos-obra-nueva' }] })
  const c = crearConsumidorWS({
    con, wsUrl: 'ws://x', token: 't', botUserId: BOT, log: crearLog(() => {}), port,
    canalesAdjuntos: new Set(['compras']),
  })
  for (let i = 0; i < 5; i++) await c.manejarMensaje(posted({ id: `m${i}` }))
  // UNA RELECTURA, NO CINCO. La relectura consulta el binding UNA VEZ POR ÁREA de adjuntos, así que
  // el número esperado sale de esa lista y no de una constante escrita a mano: cuando se sumó
  // `administracion_finanzas` (04/08), un `1` fijo se ponía rojo por el motivo equivocado — el
  // invariante que importa es que no se consulte POR MENSAJE.
  assert.equal(port.veces, AREAS_DE_ADJUNTOS.length,
    `una sola relectura del binding para cinco mensajes (${AREAS_DE_ADJUNTOS.length} consulta(s): una por área)`)
})
