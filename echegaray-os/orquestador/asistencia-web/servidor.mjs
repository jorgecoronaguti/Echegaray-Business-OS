#!/usr/bin/env node
// SERVIDOR HTTP DE LA PANTALLA DE ASISTENCIA.
//
// Node http nativo, ligado a 127.0.0.1: NO abre un puerto público. Se publica bajo el
// dominio que ya sirve Caddy, igual que el endpoint entrante de Mattermost. Esta pantalla
// no puede ser una página de Next.js porque el núcleo que lee y escribe JORNALES vive en
// esta VM y la web del OS está en Vercel: el dato no viaja, la pantalla sí.
//
// Responsabilidades de este archivo, y ninguna más:
//   · ruteo y transporte (body con límite y timeout, shutdown limpio);
//   · canje del enlace de un solo uso por una sesión de navegador;
//   · servir tres archivos estáticos;
//   · convertir cualquier excepción en un mensaje en castellano, sin stack ni secretos.
//
// La lógica de negocio está en `api.mjs`, y la de verdad, en el núcleo.

import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { crearApi } from './api.mjs'
import { dameEnlace } from './dependencias.mjs'
import { emitirSesion, verificarSesion, leerCookie, armarCookie, TTL_SEGUNDOS } from './sesion-web.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const MAX_BYTES = Number(process.env.ORQ_ASISTENCIA_WEB_MAX_BYTES ?? 256 * 1024)
const BODY_TIMEOUT_MS = Number(process.env.ORQ_ASISTENCIA_WEB_BODY_TIMEOUT_MS ?? 8000)

const ESTATICOS = Object.freeze({
  'pantalla.css': 'text/css; charset=utf-8',
  'pantalla.js': 'application/javascript; charset=utf-8',
})

const CSP = "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; "
  + "img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

const MENSAJE_ENLACE = Object.freeze({
  expirado: 'El enlace venció. Escribí /asistencia en Mattermost para pedir uno nuevo.',
  usado: 'Ese enlace ya se usó. Escribí /asistencia en Mattermost para pedir uno nuevo.',
  invalido: 'El enlace no es válido. Escribí /asistencia en Mattermost para pedir uno nuevo.',
})

const cacheArchivos = new Map()
async function archivo(nombre) {
  if (!cacheArchivos.has(nombre)) cacheArchivos.set(nombre, await readFile(join(AQUI, 'publico', nombre), 'utf8'))
  return cacheArchivos.get(nombre)
}

function responderJson(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(body)
}

function responderTexto(res, status, cuerpo, tipo) {
  res.writeHead(status, {
    'content-type': tipo,
    'content-length': Buffer.byteLength(cuerpo),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': CSP,
  })
  res.end(cuerpo)
}

const escapar = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

/** Página de corte: sin datos, sin scripts, una sola frase y qué hacer. */
function paginaAviso(titulo, mensaje) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapar(titulo)}</title>`
    + `</head><body style="font:16px/1.5 system-ui,sans-serif;margin:0;padding:2rem;color:#12161c">`
    + `<h1 style="font-size:1.15rem;margin:0 0 .5rem">${escapar(titulo)}</h1>`
    + `<p style="margin:0;max-width:34rem">${escapar(mensaje)}</p></body></html>`
}

/**
 * Lee el cuerpo con límite y timeout.
 *
 * Pasado el límite se deja de acumular pero se SIGUE drenando hasta un techo duro: cortar
 * el socket en el byte 256×1024+1 hace que el navegador reciba "conexión cerrada" en vez
 * del mensaje, y el jefe de obra ve un error en blanco. Con el techo duro tampoco se
 * puede usar el drenaje para inundar el proceso.
 */
function leerBody(req, maxBytes, timeoutMs) {
  return new Promise((resolve, reject) => {
    let total = 0
    let excedido = false
    const techo = maxBytes * 8
    const trozos = []
    const timer = setTimeout(() => { req.destroy(); reject(new Error('timeout')) }, timeoutMs)
    req.on('data', (c) => {
      total += c.length
      if (total > techo) { clearTimeout(timer); req.destroy(); reject(new Error('too_large')); return }
      if (total > maxBytes) { excedido = true; trozos.length = 0; return }
      trozos.push(c)
    })
    req.on('end', () => {
      clearTimeout(timer)
      if (excedido) reject(new Error('too_large'))
      else resolve(Buffer.concat(trozos).toString('utf8'))
    })
    req.on('error', (e) => { clearTimeout(timer); reject(e) })
  })
}

/**
 * Arma el contenedor de dependencias que comparten el servidor propio y el manejador
 * montable. Todo lo externo se inyecta: en los tests entran dobles del núcleo, del cliente
 * de Google y del verificador de enlaces — nunca la planilla real.
 */
function prepararDependencias({
  api, google, port = null, motivos = null, jornadaConfig = null,
  secreto = process.env.ORQ_ASISTENCIA_WEB_SECRETO,
  // El secreto del ENLACE tiene que ser EL MISMO con el que se firma del otro lado
  // (`comunicacion/enlace-firmado.mjs`), o la pantalla rechaza todo enlace válido. El nombre
  // canónico es el que usa quien emite; los otros dos quedan como respaldo para no romper
  // una instalación a medio migrar.
  secretoEnlace = process.env.ASISTENCIA_ENLACE_SECRETO
    || process.env.ORQ_ASISTENCIA_ENLACE_SECRETO
    || process.env.ORQ_ASISTENCIA_WEB_SECRETO,
  enlace = null, base = process.env.ORQ_ASISTENCIA_WEB_BASE || '/asistencia',
  cookieSegura = process.env.ORQ_ASISTENCIA_WEB_COOKIE_INSEGURA !== '1',
  log = console,
} = {}) {
  if (!secreto) throw new Error('asistencia-web: falta ORQ_ASISTENCIA_WEB_SECRETO')
  const usar = api ?? crearApi({ google, port, motivos, jornadaConfig })
  return { dep: { usar, secreto, secretoEnlace, enlace, base, cookieSegura, log }, base }
}

/**
 * Crea el servidor. Todo lo externo se inyecta: en los tests entran dobles del núcleo,
 * del cliente de Google y del verificador de enlaces — nunca la planilla real.
 */
export function crearServidorAsistencia(opciones = {}) {
  const { dep, base } = prepararDependencias(opciones)
  const server = http.createServer((req, res) => {
    manejar(dep, req, res).catch((e) => {
      dep.log?.error?.('asistencia-web: fallo no controlado', { error: String(e?.message ?? e) })
      if (!res.headersSent) responderJson(res, 500, { error: 'No se pudo completar la operación.' })
      else res.end()
    })
  })
  return { server, base }
}

/** Identidad del pedido, desde la cookie firmada. */
function actorDe(dep, req) {
  const s = verificarSesion({ secreto: dep.secreto, valor: leerCookie(req.headers.cookie) })
  return s.ok ? { userId: s.userId, username: s.username } : null
}

async function manejar(dep, req, res) {
  const atendido = await enrutar(dep, req, res)
  if (!atendido) responderJson(res, 404, { error: 'No existe esa dirección.' })
}

/**
 * Ruteo puro: devuelve `true` si la pantalla atendió el pedido y falsy si la ruta no es suya.
 * Separado de `manejar` para poder MONTAR la pantalla dentro de otro servidor (el del slash
 * command) en vez de levantar un segundo proceso escuchando en otro puerto: dos servidores
 * son dos units, dos puertos y dos lugares donde mirar cuando algo falla.
 */
async function enrutar(dep, req, res) {
  const url = new URL(req.url ?? '/', 'http://asistencia.local')
  const ruta = url.pathname.replace(/\/+$/, '') || '/'
  if (ruta === dep.base) { await paginaPrincipal(dep, req, res, url); return true }
  const estatico = ruta.startsWith(`${dep.base}/`) ? ruta.slice(dep.base.length + 1) : null
  if (estatico && ESTATICOS[estatico]) {
    await responderTexto(res, 200, await archivo(estatico), ESTATICOS[estatico])
    return true
  }
  if (ruta.startsWith(`${dep.base}/api/`)) { await rutaApi(dep, req, res, url, ruta); return true }
  return false
}

/**
 * Manejador montable: `(req, res) => Promise<boolean>`. Es el contrato que espera el punto de
 * montaje de `comunicacion/servidor-asistencia.mjs`. Devolver falsy sin escribir deja que el
 * servidor anfitrión responda su propio 404.
 */
export function crearManejadorPantalla(opciones = {}) {
  const { dep } = prepararDependencias(opciones)
  return async (req, res) => {
    try {
      return await enrutar(dep, req, res)
    } catch (e) {
      dep.log?.error?.('asistencia-web: fallo no controlado', { error: String(e?.message ?? e) })
      if (!res.headersSent) responderJson(res, 500, { error: 'No se pudo completar la operación.' })
      else res.end()
      return true
    }
  }
}

/** GET base: canjea el token de un solo uso por sesión, o sirve la pantalla. */
async function paginaPrincipal(dep, req, res, url) {
  if (req.method !== 'GET') return responderJson(res, 405, { error: 'Método no permitido.' })
  const token = url.searchParams.get('t')
  if (token) {
    const mod = await dameEnlace(dep.enlace)
    const v = await mod.verificarEnlace({ secreto: dep.secretoEnlace, token, consumir: true })
    if (!v.ok) {
      const msg = MENSAJE_ENLACE[v.motivo] ?? MENSAJE_ENLACE.invalido
      return responderTexto(res, 401, paginaAviso('Enlace no válido', msg), 'text/html; charset=utf-8')
    }
    const s = emitirSesion({ secreto: dep.secreto, userId: v.userId, username: v.username })
    res.setHeader('set-cookie', armarCookie({ valor: s.valor, ruta: dep.base, ttlSegundos: TTL_SEGUNDOS, segura: dep.cookieSegura }))
    res.writeHead(302, { location: dep.base, 'cache-control': 'no-store' })
    return res.end()
  }
  if (!actorDe(dep, req)) {
    return responderTexto(res, 401, paginaAviso('Sesión vencida', MENSAJE_ENLACE.expirado), 'text/html; charset=utf-8')
  }
  const html = (await archivo('pantalla.html')).replaceAll('{{BASE}}', dep.base)
  return responderTexto(res, 200, html, 'text/html; charset=utf-8')
}

async function rutaApi(dep, req, res, url, ruta) {
  const correlationId = randomUUID()
  const actor = actorDe(dep, req)
  const cola = ruta.slice(`${dep.base}/api/`.length)
  if (req.method === 'GET' && cola === 'contexto') {
    return responderJson(res, ...desarmar(await dep.usar.contexto({ actor, params: url.searchParams, correlationId })))
  }
  if (req.method === 'GET' && cola === 'cuadrilla') {
    return responderJson(res, ...desarmar(await dep.usar.cuadrilla({ actor, params: url.searchParams, correlationId })))
  }
  if (req.method === 'POST' && cola === 'registrar') {
    let cuerpo
    try {
      cuerpo = JSON.parse(await leerBody(req, MAX_BYTES, BODY_TIMEOUT_MS) || '{}')
    } catch (e) {
      const status = e.message === 'too_large' ? 413 : e.message === 'timeout' ? 408 : 400
      return responderJson(res, status, { error: 'No se pudo leer la carga enviada.' })
    }
    return responderJson(res, ...desarmar(await dep.usar.registrar({ actor, body: cuerpo, correlationId })))
  }
  return responderJson(res, 404, { error: 'No existe esa dirección.' })
}

const desarmar = (r) => [r.status, r.body]

/** Arranque como proceso. Fail-closed: sin secreto no levanta. */
async function main() {
  const { makeGoogleClient } = await import('../lib/google.mjs')
  const { loadConfig } = await import('../lib/config.mjs')
  const { getPool } = await import('../lib/db.mjs')
  const host = process.env.ORQ_ASISTENCIA_WEB_HOST ?? '127.0.0.1'
  const puerto = Number(process.env.ORQ_ASISTENCIA_WEB_PORT ?? 8793)
  const { server, base } = crearServidorAsistencia({
    google: makeGoogleClient({ config: loadConfig() }),
    port: getPool(),
  })
  for (const s of ['SIGTERM', 'SIGINT']) {
    process.on(s, () => { console.log(`asistencia-web: cerrando (${s})`); server.close(() => process.exit(0)) })
  }
  server.listen(puerto, host, () => console.log(`asistencia-web escuchando en http://${host}:${puerto}${base}`))
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
}
