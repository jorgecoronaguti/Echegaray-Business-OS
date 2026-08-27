#!/usr/bin/env node
// PR-4.1 · Servidor HTTP delgado del endpoint entrante de Mattermost.
//
// Node http mínimo, ligado a 127.0.0.1 (NO abre puerto público: se publica
// detrás de Caddy en una ruta, ver docs). Sólo transporte: lee el raw body con
// límite de tamaño y timeout, extrae la IP real de forma segura (X-Forwarded-For,
// confiando SÓLO en el proxy de front), y delega al manejador (endpoint-entrante).
// La seguridad (HMAC/timestamp/anti-replay/allowlist) y la persistencia viven en
// el Communication Service. Shutdown limpio. systemd-ready, NO activado.
//
// Uso (staging / prueba controlada, NO producción sin autorización):
//   DATABASE_URL=… MM_INCOMING_SECRET=… node orquestador/comunicacion/servidor-entrante.mjs
import http from 'node:http'
import { crearConector } from './conector.mjs'
import { crearManejadorWebhook } from './endpoint-entrante.mjs'
import { crearAutenticadorEndpoint } from './auth-endpoint.mjs'
import { crearManejadorXsas } from './xsas-http.mjs'
import { atender } from '../lib/xsas-gateway.mjs'
import { query } from '../lib/db.mjs'
import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { operadorPara, getTokenFor } from '../lib/google-oauth.mjs'
import { loadConfig } from '../lib/config.mjs'
import { MattermostCliente, crearLog } from '../../../communication-service/src/index.mjs'

const HOST = process.env.COMM_HTTP_HOST ?? '127.0.0.1' // nunca 0.0.0.0 por defecto
const PORT = Number(process.env.COMM_HTTP_PORT ?? 8791)
const RUTA = process.env.COMM_HTTP_PATH ?? '/integrations/mattermost/events'
const MAX_BYTES = Number(process.env.COMM_HTTP_MAX_BYTES ?? 64 * 1024)
// LA PUERTA DE XSAS COMPARTE ESTE PROCESO, NO ABRE OTRO. Es el mismo borde 127.0.0.1 detrás de
// Caddy, con su propio secreto y su propia ruta: un segundo servidor sería un segundo lugar donde
// olvidarse de cerrar algo.
const RUTA_XSAS = process.env.XSAS_HTTP_PATH ?? '/xsas'
const BODY_TIMEOUT_MS = Number(process.env.COMM_HTTP_BODY_TIMEOUT_MS ?? 5000)
const log = crearLog()

/**
 * EL CLIENTE DE GOOGLE DE LA PUERTA — el mismo criterio que `os.mjs` y el motor interactivo.
 *
 * Sin esto la puerta cargaba SÓLO el registro 0-API, y las capacidades de Workspace (Slides,
 * tesorería sobre el Sheet) quedaban registradas pero inalcanzables desde HTTP: existían en el
 * código y no existían para quien entra. Se resuelve UNA vez al arrancar, no por pedido — pedir
 * el token del operador en cada request agrega latencia a todo, incluso a lo que no toca Google.
 *
 * Si nadie autorizó la cuenta operadora devuelve `null` y la puerta sigue contestando con el
 * núcleo 0-API. Degradar es perder una capacidad, no perder el sistema.
 */
async function googleDeLaPuerta() {
  try {
    const op = await operadorPara()
    if (!op) { log.warn('xsas: sin cuenta operadora autorizada — la puerta arranca sin Google'); return null }
    return makeGoogleClient({ config: loadConfig(), scopes: WORKSPACE_SCOPES, getToken: getTokenFor(op) })
  } catch (e) {
    log.warn('xsas: no se pudo armar el cliente de Google', { motivo: String(e?.message ?? e).slice(0, 120) })
    return null
  }
}

/** IP real detrás de Caddy: primer valor de X-Forwarded-For (que setea el proxy),
 *  o la IP de socket si no hay proxy. La allowlist final la aplica el verificador. */
function ipReal(req) {
  const xff = req.headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim()
  return req.socket?.remoteAddress ?? null
}

function leerBody(req, maxBytes, timeoutMs) {
  return new Promise((resolve, reject) => {
    let total = 0
    const trozos = []
    const timer = setTimeout(() => { req.destroy(); reject(new Error('timeout')) }, timeoutMs)
    req.on('data', (c) => {
      total += c.length
      if (total > maxBytes) { clearTimeout(timer); req.destroy(); reject(new Error('too_large')) ; return }
      trozos.push(c)
    })
    req.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(trozos).toString('utf8')) })
    req.on('error', (e) => { clearTimeout(timer); reject(e) })
  })
}

async function main() {
  // Cliente Mattermost real para publicar respuestas (bot @os). Fail-closed sin token.
  const cliente = process.env.MM_BOT_TOKEN
    ? new MattermostCliente({ baseUrl: process.env.MM_BASE_URL ?? 'http://mattermost:8065', token: process.env.MM_BOT_TOKEN })
    : undefined // el conector arma un Fake sólo si no hay token (dev)
  // La auth vive en el ENDPOINT (HMAC-o-token): el conector va SIN verificador.
  const con = crearConector({ cliente, log, verificador: null })
  const autenticador = crearAutenticadorEndpoint({
    secretoHmac: process.env.MM_INCOMING_SECRET || null,       // camino firmado (opcional en esta etapa)
    tokenMattermost: process.env.MM_INCOMING_TOKEN || null,    // camino nativo del outgoing webhook
    ventanaSegundos: Number(process.env.MM_INCOMING_WINDOW ?? 300),
    allowlist: (process.env.MM_INCOMING_ALLOWLIST || '').split(',').map((s) => s.trim()).filter(Boolean),
  })
  const manejar = crearManejadorWebhook(con, { maxBytes: MAX_BYTES, autenticador })
  const manejarXsas = crearManejadorXsas({
    atender,
    secreto: process.env.XSAS_GATEWAY_SECRET || null,
    gateway: { query, google: await googleDeLaPuerta() },
    ruta: RUTA_XSAS,
  })

  const server = http.createServer(async (req, res) => {
    const camino = String(req.url ?? '').split('?')[0]
    if (camino === RUTA_XSAS) {
      let cuerpo = ''
      try {
        cuerpo = await leerBody(req, 256 * 1024, BODY_TIMEOUT_MS)
      } catch (e) {
        return responder(res, e.message === 'too_large' ? 413 : 408, { error: e.message })
      }
      const rx = await manejarXsas({ method: req.method, url: req.url, headers: req.headers, rawBody: cuerpo })
      return responder(res, rx.status, rx.body)
    }
    if (req.url !== RUTA) return responder(res, 404, { error: 'not_found' })
    let rawBody = ''
    try {
      rawBody = await leerBody(req, MAX_BYTES, BODY_TIMEOUT_MS)
    } catch (e) {
      const status = e.message === 'too_large' ? 413 : 408
      return responder(res, status, { error: e.message })
    }
    const r = await manejar({ method: req.method, headers: req.headers, rawBody, ip: ipReal(req) })
    responder(res, r.status, r.body)
  })

  const cerrar = (s) => { log.info('shutdown', { señal: s }); server.close(() => process.exit(0)) }
  for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => cerrar(s))

  server.listen(PORT, HOST, () => log.info('endpoint entrante escuchando', { host: HOST, port: PORT, ruta: RUTA, xsas: RUTA_XSAS }))
}

function responder(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
  res.end(body)
}

main().catch((e) => { console.error(e); process.exit(1) })
