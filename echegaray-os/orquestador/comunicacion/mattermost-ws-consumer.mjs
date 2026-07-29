#!/usr/bin/env node
// PR-4.2 · Consumidor WebSocket del bot @os (transporte de ENTRADA definitivo).
//
// Reemplaza al outgoing webhook: el OS se conecta SALIENTE a Mattermost como bot
// (WebSocket autenticado con el token del bot, sobre TLS) y RECIBE los eventos de
// los canales/DMs donde el bot es miembro — incluidos privados. La autenticidad
// la da la conexión autenticada; NO hay endpoint inbound. Sólo cambia CÓMO entra
// el evento: todo lo de aguas abajo (canónico, inbox, bridge, Work Fabric, outbox,
// publicación) es idéntico y no se toca.
//
// GUARDAS (antes de crear cualquier evento canónico ⇒ costo cero para lo
// irrelevante): sólo `posted`; ignora el eco del propio bot; ignora lo que no sea
// DM ni mención directa a @os; deduplica por post.id. Recién si pasa todo, arma el
// payload que el MattermostAdapter ya espera y llama `con.recibir`.
//
// El consumidor SÓLO ingresa (llena el inbox). El drenaje (inbox → Work Fabric →
// outbox → publicar) lo hace el worker-comunicacion, un servicio aparte.
//
// Uso (NO producción sin autorización):
//   MM_WS_URL=… MM_BOT_TOKEN=… MM_BOT_USER_ID=… DATABASE_URL=… \
//     node orquestador/comunicacion/mattermost-ws-consumer.mjs

import { crearConector } from './conector.mjs'
import { crearLog } from '../../../communication-service/src/index.mjs'

const PLATAFORMA = 'mattermost'

// ── Helpers puros (testeables sin red ni DB) ────────────────────────────────

/** Parsea un mensaje WS crudo de Mattermost. Devuelve la info relevante de un
 *  evento `posted`, o null si no es un `posted` válido (health/hello/typing/…). */
export function parsearPosted(mensaje) {
  let m = mensaje
  if (typeof mensaje === 'string') { try { m = JSON.parse(mensaje) } catch { return null } }
  if (!m || typeof m !== 'object' || m.event !== 'posted') return null
  const d = m.data ?? {}
  let post
  try { post = typeof d.post === 'string' ? JSON.parse(d.post) : d.post } catch { return null }
  if (!post || !post.id) return null
  let mentions = []
  try { mentions = d.mentions ? (typeof d.mentions === 'string' ? JSON.parse(d.mentions) : d.mentions) : [] } catch { mentions = [] }
  return {
    post,
    channelType: d.channel_type ?? null,
    channelName: d.channel_name ?? null,
    senderName: (d.sender_name ?? '').replace(/^@/, '') || null,
    teamId: d.team_id ?? null,
    mentions: Array.isArray(mentions) ? mentions : [],
  }
}

function escaparRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

/** GUARDA de relevancia. Acepta SÓLO: DM al bot, o mención directa a @os (por
 *  user_id en mentions o por texto). Rechaza el eco del propio bot. Todo lo demás
 *  se ignora ANTES de crear un evento ⇒ cero costo. */
export function esRelevante(info, { botUserId = null, botUsername = 'os' } = {}) {
  if (!info?.post) return false
  const { post, channelType, mentions } = info
  if (botUserId && post.user_id === botUserId) return false // eco propio (anti-loop)
  if (post.type && post.type !== '') return false // posts de sistema (join/leave/header) no son mensajes
  if (channelType === 'D') return true // mensaje directo al bot
  const porId = Boolean(botUserId && mentions.includes(botUserId))
  const porTexto = new RegExp(`(^|\\s)@${escaparRegex(botUsername)}\\b`, 'i').test(post.message ?? '')
  return porId || porTexto
}

/** Mapea el post de Mattermost al payload que el MattermostAdapter ya espera.
 *  `post_id` = post.id REAL: es la clave natural de dedup e idempotencia y, para
 *  un mensaje top-level, también la raíz del hilo (se responde bajo ese post). */
export function mapearAPayload(post, info = {}) {
  return {
    user_id: post.user_id ?? null,
    user_name: info.senderName ?? null,
    channel_id: post.channel_id ?? null,
    channel_name: info.channelName ?? null,
    team_id: info.teamId ?? null,
    post_id: post.id,
    text: post.message ?? '',
    root_id: post.root_id || post.id, // hilo preservado (raíz real del thread)
  }
}

/** Deduplicador acotado por post.id (ventana reciente). Primera línea de dedup a
 *  costo cero; el repositorio (idempotency_key) es el respaldo durable. */
export class Deduplicador {
  constructor(max = 5000) { this.max = max; this._set = new Set() }
  visto(id) { return this._set.has(id) }
  marcar(id) {
    this._set.add(id)
    if (this._set.size > this.max) { const it = this._set.values(); this._set.delete(it.next().value) }
  }
}

// ── Consumidor (WebSocket inyectable para tests) ────────────────────────────

/**
 * @param {object} opts
 * @param {{recibir:Function}} opts.con   conector (o stub) con `recibir(payload,ctx)`
 * @param {string} opts.wsUrl @param {string} opts.token  URL WS + token del bot
 * @param {string} [opts.botUserId] @param {string} [opts.botUsername]
 * @param {Function} [opts.WebSocketImpl] impl de WebSocket (default: nativa de Node)
 * @param {object} [opts.log] @param {()=>number} [opts.ahora]
 * @param {number} [opts.pingMs] @param {number} [opts.backoffBaseMs] @param {number} [opts.backoffMaxMs]
 */
export function crearConsumidorWS(opts) {
  const {
    con, wsUrl, token, botUserId = null, botUsername = 'os',
    WebSocketImpl = globalThis.WebSocket, log = crearLog(),
    pingMs = 30_000, backoffBaseMs = 1000, backoffMaxMs = 30_000, dedupMax = 5000,
  } = opts
  if (!con?.recibir) throw new Error('consumidor-ws: falta con.recibir')
  if (!wsUrl) throw new Error('consumidor-ws: falta wsUrl')
  if (!WebSocketImpl) throw new Error('consumidor-ws: no hay WebSocket disponible')

  const dedup = new Deduplicador(dedupMax)
  let ws = null, seq = 1, pingTimer = null, reconTimer = null, reintentos = 0, cerrado = false, autenticado = false

  /** Procesa un mensaje WS crudo: guardas → (si pasa) recibir. Devuelve el estado
   *  para trazabilidad y test. NO invoca nada de razonamiento. */
  async function manejarMensaje(raw) {
    const info = parsearPosted(raw)
    if (!info) return { estado: 'no-posted' }
    if (!esRelevante(info, { botUserId, botUsername })) {
      log.info?.('ws: ignorado por guarda', { post_id: info.post.id, channel_type: info.channelType })
      return { estado: 'ignorado' }
    }
    if (dedup.visto(info.post.id)) { log.info?.('ws: duplicado ignorado', { post_id: info.post.id }); return { estado: 'duplicado' } }
    dedup.marcar(info.post.id)
    const payload = mapearAPayload(info.post, info)
    const ev = await con.recibir(payload, { plataforma: PLATAFORMA })
    if (ev) log.info?.('ws: evento aceptado → inbox', { post_id: info.post.id, correlation_id: ev.correlation_id, type: ev.type })
    return { estado: ev ? 'aceptado' : 'ignorado-cs', ev }
  }

  function limpiarTimers() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
    if (reconTimer) { clearTimeout(reconTimer); reconTimer = null }
  }

  function iniciarPing() {
    if (pingTimer) clearInterval(pingTimer)
    pingTimer = setInterval(() => {
      try { ws?.send(JSON.stringify({ action: 'ping', seq: seq++ })) } catch { /* el close reconecta */ }
    }, pingMs)
    if (typeof pingTimer.unref === 'function') pingTimer.unref()
  }

  function reagendar(motivo) {
    if (cerrado) return
    limpiarTimers()
    const espera = Math.min(backoffBaseMs * 2 ** reintentos, backoffMaxMs)
    reintentos++
    log.warn?.('ws: reconectando con backoff', { motivo, espera_ms: espera, intento: reintentos })
    reconTimer = setTimeout(conectar, espera)
    if (typeof reconTimer.unref === 'function') reconTimer.unref()
  }

  function conectar() {
    if (cerrado) return
    autenticado = false
    try { ws = new WebSocketImpl(wsUrl) } catch (e) { return reagendar(`new WebSocket: ${e?.message ?? e}`) }

    ws.onopen = () => {
      // authentication_challenge con el token del bot (bot account).
      try { ws.send(JSON.stringify({ seq: seq++, action: 'authentication_challenge', data: { token } })) } catch (e) { return reagendar(`auth send: ${e?.message ?? e}`) }
      log.info?.('ws: conectado, enviado authentication_challenge', { url: ofuscarUrl(wsUrl) })
    }
    ws.onmessage = async (msg) => {
      const raw = typeof msg?.data === 'string' ? msg.data : (msg?.data?.toString?.() ?? '')
      // `hello` confirma autenticación exitosa → resetea el backoff.
      if (!autenticado && /"event"\s*:\s*"hello"/.test(raw)) {
        autenticado = true; reintentos = 0; iniciarPing()
        log.info?.('ws: autenticado (hello)', {})
      }
      try { await manejarMensaje(raw) } catch (e) { log.error?.('ws: manejarMensaje falló', { error: String(e?.message ?? e) }) }
    }
    ws.onerror = (e) => { log.warn?.('ws: error de socket', { error: String(e?.message ?? e?.error ?? e) }) }
    ws.onclose = (e) => { limpiarTimers(); if (!cerrado) reagendar(`close ${e?.code ?? ''}`) }
  }

  function cerrar() {
    cerrado = true
    limpiarTimers()
    try { ws?.close() } catch { /* ignorar */ }
    log.info?.('ws: cerrado limpio', {})
  }

  return { conectar, cerrar, manejarMensaje, _estado: () => ({ autenticado, reintentos, cerrado }) }
}

function ofuscarUrl(u) { try { const x = new URL(u); return `${x.protocol}//${x.host}${x.pathname}` } catch { return '(url)' } }

// ── Entrypoint (systemd) ────────────────────────────────────────────────────

async function main() {
  const log = crearLog()
  const wsUrl = process.env.MM_WS_URL ?? 'ws://127.0.0.1:8065/api/v4/websocket'
  const token = process.env.MM_BOT_TOKEN
  const botUserId = process.env.MM_BOT_USER_ID ?? null
  const botUsername = process.env.MM_BOT_USERNAME ?? 'os'
  // El token es imprescindible para el handshake WS (authentication_challenge).
  if (!token) { console.error('mattermost-ws-consumer: falta MM_BOT_TOKEN (fail-closed)'); process.exit(1) }

  // El conector resuelve el cliente REAL desde MM_BOT_TOKEN (FAIL-FAST, sin Fake en
  // producción). El consumidor sólo INGRESA (recibir); la auth de ENTRADA la da la
  // conexión WS autenticada ⇒ conector SIN verificador.
  let con
  try {
    con = crearConector({ log, verificador: null, botUserId })
  } catch (e) {
    console.error('mattermost-ws-consumer: no arranca —', String(e?.message ?? e))
    process.exit(1)
  }

  const consumidor = crearConsumidorWS({ con, wsUrl, token, botUserId, botUsername, log })
  for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { log.info('shutdown pedido', { señal: s }); consumidor.cerrar(); process.exit(0) })
  consumidor.conectar()
  log.info('mattermost-ws-consumer arrancado', { url: ofuscarUrl(wsUrl), bot: botUsername })
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1) })
