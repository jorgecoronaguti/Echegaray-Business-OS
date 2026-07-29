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
import { MattermostCliente, crearLog } from '../../../communication-service/src/index.mjs'

const HOST = process.env.COMM_HTTP_HOST ?? '127.0.0.1' // nunca 0.0.0.0 por defecto
const PORT = Number(process.env.COMM_HTTP_PORT ?? 8791)
const RUTA = process.env.COMM_HTTP_PATH ?? '/integrations/mattermost/events'
const MAX_BYTES = Number(process.env.COMM_HTTP_MAX_BYTES ?? 64 * 1024)
const BODY_TIMEOUT_MS = Number(process.env.COMM_HTTP_BODY_TIMEOUT_MS ?? 5000)
const log = crearLog()

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
  const con = crearConector({ cliente, log })
  const manejar = crearManejadorWebhook(con, { maxBytes: MAX_BYTES })

  const server = http.createServer(async (req, res) => {
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

  server.listen(PORT, HOST, () => log.info('endpoint entrante escuchando', { host: HOST, port: PORT, ruta: RUTA }))
}

function responder(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
  res.end(body)
}

main().catch((e) => { console.error(e); process.exit(1) })
