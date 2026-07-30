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
// ── PUNTO DE MONTAJE DE LA PANTALLA ─────────────────────────────────────────────
// La pantalla web (`GET /asistencia`, `GET /asistencia/api/contexto`,
// `GET /asistencia/api/cuadrilla`, `POST /asistencia/api/registrar`) la construye otro frente
// en `orquestador/asistencia-web/`. Este archivo NO la importa a propósito: recibe su
// manejador por parámetro (`manejarPantalla`) y lo monta.
//
//   manejarPantalla(req, res) → Promise<boolean|undefined>
//     · devolvé `true` (o respondé vos y devolvé cualquier cosa habiendo escrito la
//       respuesta) si atendiste el pedido
//     · devolvé `false`/`undefined` sin escribir nada si la ruta no es tuya: el servidor
//       responde 404
//
// El cableado final (pasarle el manejador real) lo hace el orquestador de la integración, no
// este archivo ni el del otro frente. Mientras no exista, `/asistencia` responde un mensaje
// honesto en castellano en vez de una pantalla en blanco.

import http from 'node:http'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { crearComandoAsistencia } from './comando-asistencia.mjs'

export const RUTA_COMANDO_DEFAULT = '/asistencia/comando'
export const RUTA_PANTALLA_DEFAULT = '/asistencia'
const MAX_BYTES_DEFAULT = 16 * 1024 // un slash command de Mattermost son ~1 KB
const BODY_TIMEOUT_MS_DEFAULT = 5000

const TEXTO = Object.freeze({
  NO_ENCONTRADO: 'No encontré esa página.',
  METODO: 'Ese pedido no es válido.',
  TIPO: 'No entendí el formato del pedido.',
  GRANDE: 'El pedido es demasiado grande.',
  LENTO: 'El pedido tardó demasiado.',
  INTERNO: 'Hubo un problema y no pude atenderte. Probá de nuevo en un minuto.',
  PANTALLA_NO_MONTADA: 'La pantalla de asistencia todavía no está disponible. Mientras tanto podés cargar la asistencia escribiéndole a @os en el chat.',
})

/**
 * Crea el servidor. NO hace `listen`: eso lo decide quien lo usa (los tests lo levantan en
 * el puerto 0 y nunca tocan el 8792 real).
 *
 * @param {object} o
 * @param {Function} o.manejarComando        async ({campos, ip}) => {status, body}
 * @param {Function|null} [o.manejarPantalla] punto de montaje del frente web (ver arriba)
 * @param {string} [o.rutaComando]
 * @param {string} [o.rutaPantalla]
 * @param {number} [o.maxBytes]
 * @param {number} [o.bodyTimeoutMs]
 * @param {object} [o.log]
 * @returns {import('node:http').Server}
 */
export function crearServidorAsistencia({
  manejarComando,
  manejarPantalla = null,
  rutaComando = RUTA_COMANDO_DEFAULT,
  rutaPantalla = RUTA_PANTALLA_DEFAULT,
  maxBytes = MAX_BYTES_DEFAULT,
  bodyTimeoutMs = BODY_TIMEOUT_MS_DEFAULT,
  log = null,
} = {}) {
  if (typeof manejarComando !== 'function') throw new Error('crearServidorAsistencia: falta manejarComando')

  return http.createServer(async (req, res) => {
    try {
      const ruta = soloRuta(req.url)

      if (ruta === rutaComando) return await atenderComando(req, res, { manejarComando, maxBytes, bodyTimeoutMs })

      if (ruta === rutaPantalla || ruta.startsWith(`${rutaPantalla}/`)) {
        if (typeof manejarPantalla === 'function') {
          const atendido = await manejarPantalla(req, res)
          if (res.writableEnded || res.headersSent) return undefined
          if (atendido) return undefined
        } else {
          // Sin la pantalla montada, se dice qué pasa y qué hacer. Nunca una página en blanco.
          return responder(res, 503, { error: TEXTO.PANTALLA_NO_MONTADA })
        }
      }

      return responder(res, 404, { error: TEXTO.NO_ENCONTRADO })
    } catch (e) {
      log?.warn?.('error atendiendo un pedido de asistencia', { detalle: String(e?.message ?? e).slice(0, 200) })
      if (res.writableEnded || res.headersSent) return undefined
      return responder(res, 500, { error: TEXTO.INTERNO })
    }
  })
}

async function atenderComando(req, res, { manejarComando, maxBytes, bodyTimeoutMs }) {
  if (req.method !== 'POST') return responder(res, 405, { error: TEXTO.METODO })
  const ct = String(req.headers['content-type'] ?? '')
  if (!/application\/x-www-form-urlencoded|application\/json/i.test(ct)) {
    return responder(res, 415, { error: TEXTO.TIPO })
  }
  let raw
  try {
    raw = await leerBody(req, maxBytes, bodyTimeoutMs)
  } catch (e) {
    // Se responde ANTES de cortar: un 413 mudo (socket destruido de golpe) se ve del otro
    // lado como "el servidor se cayó", y manda a mirar el lugar equivocado.
    return e.message === 'too_large'
      ? responderYCortar(req, res, 413, { error: TEXTO.GRANDE })
      : responderYCortar(req, res, 408, { error: TEXTO.LENTO })
  }
  const campos = parsear(raw, ct)
  if (!campos) return responder(res, 400, { error: TEXTO.TIPO })
  const r = await manejarComando({ campos, ip: ipReal(req) })
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

  const manejarComando = crearComandoAsistencia({
    tokenComando: process.env.MM_SLASH_TOKEN_ASISTENCIA || null,
    secretoEnlace: process.env.ASISTENCIA_ENLACE_SECRETO || null,
    urlBase: process.env.ASISTENCIA_URL_BASE || null,
    ttlSegundos: process.env.ASISTENCIA_ENLACE_TTL ? Number(process.env.ASISTENCIA_ENLACE_TTL) : undefined,
    port: pool,
    log,
  })

  // LA PANTALLA VIVE EN ESTE MISMO PROCESO. Podría ser un segundo servicio en otro puerto,
  // pero serían dos units, dos puertos en Caddy y dos lugares donde mirar cuando algo falla,
  // para dos superficies que sólo tienen sentido juntas: el comando entrega el enlace que
  // abre la pantalla. Si el módulo de la pantalla no está, el comando sigue funcionando y
  // `/asistencia` responde su aviso — no se cae el proceso entero por eso.
  let manejarPantalla = null
  try {
    const web = await import('../asistencia-web/servidor.mjs')
    const { googleDelOs } = await import('../lib/google-os.mjs')
    const google = googleDelOs()
    manejarPantalla = web.crearManejadorPantalla({ google, port: pool, log })
  } catch (e) {
    log.warn('la pantalla no se pudo montar: queda sólo el flujo por chat', {
      detalle: String(e?.message ?? e).slice(0, 200),
    })
  }

  const server = crearServidorAsistencia({ manejarComando, manejarPantalla, log })

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
      log.info('servidor de asistencia escuchando', { socket, ruta_comando: RUTA_COMANDO_DEFAULT })
    })
    return
  }

  server.listen(port, host, () => log.info('servidor de asistencia escuchando', { host, port, ruta_comando: RUTA_COMANDO_DEFAULT }))
}

// Sólo arranca si se ejecuta directo. Importarlo (tests, integración) no levanta nada.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
}
