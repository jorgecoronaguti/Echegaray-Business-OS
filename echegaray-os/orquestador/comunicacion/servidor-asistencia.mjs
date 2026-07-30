#!/usr/bin/env node
// SERVIDOR HTTP LOCAL DE ASISTENCIA — transporte, nada más.
//
// Node http mínimo, ligado a 127.0.0.1. NO abre ningún puerto público: lo único que mira a
// Internet es Caddy (contenedor `echegaray-mm-caddy`), que publica la ruta `/asistencia*` de
// https://chat.ecsas.com.ar contra este proceso en el host. Ver `infra/mattermost/caddy/Caddyfile`.
//
// Este proceso NO razona: no carga anthropic.env, no invoca ningún modelo, y no tiene por qué.
// Reparte enlaces firmados y sirve una pantalla. Igual que el consumidor WebSocket, tiene que
// poder seguir funcionando un día sin crédito de API.
//
// Responsabilidades (y sólo estas):
//   · leer el body con LÍMITE de tamaño y TIMEOUT (nadie deja una conexión colgada)
//   · extraer la IP real detrás del proxy (X-Forwarded-For lo setea Caddy)
//   · rutear `/asistencia/comando` al manejador del slash command
//   · delegar todo el resto de `/asistencia*` al PUNTO DE MONTAJE de la pantalla
//   · responder errores sin stacks y en castellano
//   · apagarse limpio con SIGTERM
//
// ── QUÉ ATIENDE ────────────────────────────────────────────────────────────────
// `POST /asistencia/accion`: los clicks de los botones y desplegables del mensaje
// interactivo, y el envío de los diálogos. Mattermost exige una URL de callback para su
// UI nativa — no es una pantalla web: nadie abre un navegador, el jefe de obra ve el
// mensaje en el canal y toca ahí.
//
// La lógica de cada click vive en `asistencia-mm/acciones.mjs`; el cableado con la guarda,
// el núcleo y el cliente de Mattermost, en `asistencia-accion.mjs`. Este archivo es
// transporte: leer el body con límite y timeout, y responder sin stacks.

import http from 'node:http'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { crearManejadorAccion } from './asistencia-accion.mjs'
import { crearComandoAsistencia } from './comando-asistencia.mjs'

export const RUTA_ACCION_DEFAULT = '/asistencia/accion'
export const RUTA_COMANDO_DEFAULT = '/asistencia/comando'
const MAX_BYTES_DEFAULT = 16 * 1024 // un slash command de Mattermost son ~1 KB
const BODY_TIMEOUT_MS_DEFAULT = 5000

const TEXTO = Object.freeze({
  NO_ENCONTRADO: 'No encontré esa página.',
  METODO: 'Ese pedido no es válido.',
  TIPO: 'No entendí el formato del pedido.',
  GRANDE: 'El pedido es demasiado grande.',
  LENTO: 'El pedido tardó demasiado.',
  INTERNO: 'Hubo un problema y no pude atenderte. Probá de nuevo en un minuto.',
})

/**
 * Crea el servidor. NO hace `listen`: eso lo decide quien lo usa (los tests lo levantan en
 * el puerto 0 y nunca tocan el 8792 real).
 *
 * @param {object} o
 * @param {Function} o.manejarAccion         async (payload) => {status, body}
 * @param {string} [o.rutaComando]
 * @param {number} [o.maxBytes]
 * @param {number} [o.bodyTimeoutMs]
 * @param {object} [o.log]
 * @returns {import('node:http').Server}
 */
export function crearServidorAsistencia({
  manejarAccion,
  manejarComando = null,
  rutaAccion = RUTA_ACCION_DEFAULT,
  rutaComando = RUTA_COMANDO_DEFAULT,
  maxBytes = MAX_BYTES_DEFAULT,
  bodyTimeoutMs = BODY_TIMEOUT_MS_DEFAULT,
  log = null,
} = {}) {
  if (typeof manejarAccion !== 'function') throw new Error('crearServidorAsistencia: falta manejarAccion')

  return http.createServer(async (req, res) => {
    try {
      const ruta = soloRuta(req.url)

      if (ruta === rutaAccion) return await atenderAccion(req, res, { manejarAccion, maxBytes, bodyTimeoutMs })

      // El slash command llega como form-urlencoded; la acción, como JSON. Los dos se leen
      // igual y se responden igual: cambia sólo a quién se le entrega el cuerpo.
      if (ruta === rutaComando && typeof manejarComando === 'function') {
        return await atenderComando(req, res, { manejarComando, maxBytes, bodyTimeoutMs })
      }

      return responder(res, 404, { error: TEXTO.NO_ENCONTRADO })
    } catch (e) {
      log?.warn?.('error atendiendo un pedido de asistencia', { detalle: String(e?.message ?? e).slice(0, 200) })
      if (res.writableEnded || res.headersSent) return undefined
      return responder(res, 500, { error: TEXTO.INTERNO })
    }
  })
}

/**
 * Lee y parsea el cuerpo. Lo comparten la acción (JSON) y el comando (form-urlencoded):
 * los dos tienen el mismo techo de tamaño, el mismo timeout y los mismos errores. Duplicarlo
 * era garantizar que algún día uno de los dos quedara sin uno de esos tres límites.
 * @returns {{ok:true, campos:object} | {ok:false, respuesta:*}}
 */
async function leerCampos(req, res, { maxBytes, bodyTimeoutMs }) {
  if (req.method !== 'POST') return { ok: false, respuesta: responder(res, 405, { error: TEXTO.METODO }) }
  const ct = String(req.headers['content-type'] ?? '')
  if (!/application\/x-www-form-urlencoded|application\/json/i.test(ct)) {
    return { ok: false, respuesta: responder(res, 415, { error: TEXTO.TIPO }) }
  }
  let raw
  try {
    raw = await leerBody(req, maxBytes, bodyTimeoutMs)
  } catch (e) {
    // Se responde ANTES de cortar: un 413 mudo (socket destruido de golpe) se ve del otro
    // lado como "el servidor se cayó", y manda a mirar el lugar equivocado.
    const r = e.message === 'too_large'
      ? responderYCortar(req, res, 413, { error: TEXTO.GRANDE })
      : responderYCortar(req, res, 408, { error: TEXTO.LENTO })
    return { ok: false, respuesta: r }
  }
  const campos = parsear(raw, ct)
  if (!campos) return { ok: false, respuesta: responder(res, 400, { error: TEXTO.TIPO }) }
  return { ok: true, campos }
}

async function atenderComando(req, res, { manejarComando, maxBytes, bodyTimeoutMs }) {
  const c = await leerCampos(req, res, { maxBytes, bodyTimeoutMs })
  if (!c.ok) return c.respuesta
  const r = await manejarComando({ campos: c.campos, ip: ipReal(req) })
  return responder(res, r.status, r.body)
}

async function atenderAccion(req, res, { manejarAccion, maxBytes, bodyTimeoutMs }) {
  const c = await leerCampos(req, res, { maxBytes, bodyTimeoutMs })
  if (!c.ok) return c.respuesta
  const r = await manejarAccion({ ...c.campos, _ip: ipReal(req) })
  return responder(res, r.status, r.body)
}

/** IP real detrás de Caddy: primer valor de X-Forwarded-For (que setea el proxy). */
export function ipReal(req) {
  const xff = req?.headers?.['x-forwarded-for']
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim()
  return req?.socket?.remoteAddress ?? null
}

/** Ruta sin query string. El token viaja en `?t=`: no forma parte del ruteo. */
export function soloRuta(url) {
  const u = String(url ?? '/')
  const q = u.indexOf('?')
  return q < 0 ? u : u.slice(0, q)
}

/** Lee el body con techo de tamaño y de tiempo. Pasado el techo deja de ACUMULAR (la memoria
 *  queda acotada) pero no destruye la conexión: eso lo hace el que responde, después de
 *  contestar. */
function leerBody(req, maxBytes, timeoutMs) {
  return new Promise((resolve, reject) => {
    let total = 0
    let cortado = false
    const trozos = []
    const timer = setTimeout(() => { cortado = true; reject(new Error('timeout')) }, timeoutMs)
    req.on('data', (c) => {
      if (cortado) return // se sigue drenando sin guardar nada
      total += c.length
      if (total > maxBytes) { cortado = true; clearTimeout(timer); reject(new Error('too_large')); return }
      trozos.push(c)
    })
    req.on('end', () => { if (!cortado) { clearTimeout(timer); resolve(Buffer.concat(trozos).toString('utf8')) } })
    req.on('error', (e) => { if (!cortado) { clearTimeout(timer); reject(e) } })
  })
}

function parsear(raw, ct) {
  try {
    if (/application\/json/i.test(ct)) return JSON.parse(raw)
    const p = new URLSearchParams(raw)
    const o = {}
    for (const [k, v] of p) o[k] = v
    return o
  } catch {
    return null
  }
}

function responder(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) })
  res.end(body)
  return undefined
}

/** Responde y recién entonces corta la conexión (el emisor sigue mandando bytes que ya no
 *  vamos a leer). Sin el callback de `end`, destruir el socket puede tragarse la respuesta. */
function responderYCortar(req, res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    connection: 'close',
  })
  res.end(body, () => { try { req.destroy() } catch { /* ya estaba cerrada */ } })
  return undefined
}

// ── arranque como servicio (systemd user unit) ──────────────────────────────────

async function main() {
  const { crearLog } = await import('../../../communication-service/src/index.mjs')
  const log = crearLog()
  const host = process.env.ASISTENCIA_HTTP_HOST ?? '127.0.0.1' // nunca 0.0.0.0: publica Caddy
  const port = Number(process.env.ASISTENCIA_HTTP_PORT ?? 8792)

  // Pool del OS sólo para permisos y consumo de enlaces. Si no hay DATABASE_URL, el
  // comando falla cerrado (deniega) en vez de repartir enlaces sin control.
  let pool = null
  try {
    const db = await import('../lib/db.mjs')
    pool = db.getPool()
  } catch (e) {
    log.warn('sin acceso a la base: los pedidos se van a denegar', { detalle: String(e?.message ?? e).slice(0, 200) })
    pool = null
  }

  // Cliente de Mattermost: abre el diálogo y reescribe el post. Sin él la carga no puede
  // avanzar, así que se falla al arrancar y no en el primer click del jefe de obra.
  const { MattermostCliente } = await import('../../../communication-service/src/index.mjs')
  const mattermost = new MattermostCliente({
    baseUrl: process.env.MM_BASE_URL,
    token: process.env.MM_BOT_TOKEN,
  })

  const manejarAccion = crearManejadorAccion({
    port: pool,
    mattermost,
    url: process.env.ASISTENCIA_ACCION_URL || null,
    log,
  })

  const manejarComando = crearComandoAsistencia({
    tokenComando: process.env.MM_SLASH_TOKEN_ASISTENCIA || null,
    port: pool,
    google: (await import('../lib/google-os.mjs')).googleDelOs(),
    url: process.env.ASISTENCIA_ACCION_URL || null,
    log,
  })

  const server = crearServidorAsistencia({ manejarAccion, manejarComando, log })

  const cerrar = (s) => { log.info('shutdown', { señal: s }); server.close(() => process.exit(0)) }
  for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => cerrar(s))

  // SOCKET UNIX antes que TCP, y no por gusto: en esta VM el firewall del host descarta las
  // conexiones que vienen de los bridges de Docker, así que Caddy —que corre en un
  // contenedor— no puede alcanzar un puerto TCP del host por ninguna de sus direcciones.
  // Abrir ese puerto en el firewall pide root y expone un puerto más. Un socket no viaja por
  // la red: se bind-montea en el contenedor y el problema desaparece. El TCP queda para
  // desarrollo local, donde no hay contenedor de por medio.
  const socket = process.env.ASISTENCIA_HTTP_SOCKET
  if (socket) {
    const fs = await import('node:fs')
    // Un socket viejo de una corrida anterior impide el bind (EADDRINUSE) aunque no haya
    // nadie escuchando. Se borra sólo si NO responde: si responde, hay otra instancia viva
    // y hay que fallar, no pisarla.
    if (fs.existsSync(socket)) {
      const vivo = await new Promise((r) => {
        const s = net.connect(socket).on('connect', () => { s.end(); r(true) }).on('error', () => r(false))
      })
      if (vivo) throw new Error(`ya hay un servidor de asistencia escuchando en ${socket}`)
      fs.unlinkSync(socket)
    }
    server.listen(socket, () => {
      // 0660: lo abre el dueño y su grupo. El contenedor de Caddy entra como root, que no
      // necesita permiso; nadie más en la máquina lo alcanza.
      try { fs.chmodSync(socket, 0o660) } catch { /* el bind ya ocurrió: no se aborta por esto */ }
      log.info('servidor de asistencia escuchando', { socket, ruta_accion: RUTA_ACCION_DEFAULT, ruta_comando: RUTA_COMANDO_DEFAULT })
    })
    return
  }

  server.listen(port, host, () => log.info('servidor de asistencia escuchando', { host, port, ruta_accion: RUTA_ACCION_DEFAULT, ruta_comando: RUTA_COMANDO_DEFAULT }))
}

// Sólo arranca si se ejecuta directo. Importarlo (tests, integración) no levanta nada.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
}
