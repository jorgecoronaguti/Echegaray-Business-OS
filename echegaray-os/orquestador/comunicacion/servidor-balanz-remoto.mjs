#!/usr/bin/env node
// PANTALLA REMOTA DEL NAVEGADOR DE BALANZ — para iniciar sesión sin abrir una terminal.
//
// ═══ QUÉ RESUELVE ═══
//
// El navegador vive en la VM y su sesión la tiene que abrir una persona. Sin esta pantalla, "abrir
// sesión" significaría entrar por SSH y pelearse con un escritorio remoto: en la práctica, que el
// agente se quede sin mercado hasta que alguien se siente frente a una computadora.
//
// Acá el dueño recibe un enlace en Mattermost, lo abre en el celular o en la notebook, ve el
// escritorio de la VM, entra a Balanz a mano y cierra la pestaña. Nada más.
//
// ═══ POR DÓNDE ENTRA, Y POR QUÉ NO ABRE NINGÚN PUERTO ═══
//
//   navegador del dueño → https://chat.ecsas.com.ar/balanz (Caddy, TLS automático)
//     → socket unix /home/jorge/.local/run/echegaray/balanz.sock  ← ESTE PROCESO
//       → 127.0.0.1:5900 (VNC del contenedor, publicado sólo en loopback)
//
// Es el mismo camino que ya usa la pantalla de asistencia, y por el mismo motivo: el firewall de la
// VM descarta las conexiones que van de los bridges de Docker al host, y un socket unix no viaja por
// la red. **Este proceso no escucha en ninguna interfaz de red.**
//
// ═══ LO QUE NO HACE ═══
//
// No automatiza el login. No completa usuario, contraseña, OTP ni CAPTCHA. No registra pulsaciones:
// el puente mueve tramas opacas y no las interpreta (ver `balanz-ws.mjs`). No guarda credenciales de
// Balanz — la única credencial que toca es la del escritorio, que genera el contenedor y sirve para
// llegar a la pantalla, no a la cuenta.

import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verificarToken, tokenDeUrl } from './balanz-remoto-token.mjs'
import { responderApreton, leerTramas, armarTrama, OPCODE } from './balanz-ws.mjs'
import { configRuntime } from '../lib/tesoreria/navegador-runtime.mjs'

export const RUTA_BASE = process.env.BALANZ_REMOTO_RUTA || '/balanz'
const RAIZ_NOVNC = fileURLToPath(new URL('../../node_modules/@novnc/novnc/', import.meta.url))

const TIPOS = { '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.html': 'text/html; charset=utf-8' }

const soloRuta = (url) => String(url || '').split('?')[0]

/** La contraseña del escritorio la escribe el contenedor. Si falta, se dice: no se inventa una. */
async function claveEscritorio(cfg) {
  try { return (await readFile(join(cfg.base, 'estado', 'vnc.plain'), 'utf8')).trim() } catch { return null }
}

/**
 * LA PÁGINA. Se arma acá y no en un archivo suelto para que la clave del escritorio no quede nunca
 * escrita en disco fuera del estado del contenedor: se inyecta en la respuesta, que sólo recibe
 * quien presentó un enlace válido.
 */
function paginaRemota({ token, clave }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Balanz — pantalla remota</title>
<style>
 :root { color-scheme: dark }
 body { margin:0; background:#0d1117; color:#e6edf3; font:14px/1.5 system-ui,sans-serif }
 header { padding:.6rem .9rem; background:#161b22; border-bottom:1px solid #30363d; display:flex; gap:.8rem; align-items:center; flex-wrap:wrap }
 header b { font-weight:600 }
 #estado { color:#7d8590 }
 #pantalla { width:100vw; height:calc(100vh - 46px); background:#000 }
 .aviso { padding:1rem; color:#f0883e }
</style></head><body>
<header>
  <b>Balanz</b><span id="estado">conectando…</span>
  <span style="margin-left:auto;color:#7d8590">Iniciá sesión a mano. Nadie más ve esta pantalla.</span>
</header>
<div id="pantalla"></div>
<script type="module">
 import RFB from '${RUTA_BASE}/vendor/core/rfb.js'
 const estado = document.getElementById('estado')
 const url = new URL('${RUTA_BASE}/ws', location.href)
 url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
 url.searchParams.set('t', ${JSON.stringify(token)})
 try {
   const rfb = new RFB(document.getElementById('pantalla'), url.href, { credentials: { password: ${JSON.stringify(clave || '')} } })
   rfb.scaleViewport = true
   rfb.resizeSession = false
   rfb.addEventListener('connect', () => { estado.textContent = 'conectado' })
   rfb.addEventListener('disconnect', (e) => { estado.textContent = e.detail.clean ? 'sesión cerrada' : 'se cortó la conexión — recargá con un enlace nuevo' })
   rfb.addEventListener('securityfailure', () => { estado.textContent = 'el escritorio rechazó la credencial' })
 } catch (e) { estado.textContent = 'no se pudo abrir la pantalla: ' + e.message }
</script></body></html>`
}

const denegar = (res, code, texto) => { res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' }); res.end(texto) }

/**
 * Sirve un archivo de noVNC. Es JavaScript público de una librería abierta: no lleva token. Lo que
 * sí lleva es una guarda de recorrido — sin ella, `/vendor/../../../.env` serviría los secretos del
 * OS por esta misma ruta.
 */
async function servirEstatico(res, relativo) {
  // ── SE RECHAZA, NO SE REESCRIBE ───────────────────────────────────────────────────────────────
  //
  // La primera versión le sacaba los `../` de adelante al pedido y seguía. Con eso,
  // `/vendor/../../../package.json` no fallaba: servía el `package.json` de noVNC con un 200, o sea
  // que la ruta contestaba a un recorrido en vez de negarlo. No filtró nada por casualidad —el
  // archivo al que caía era inofensivo— pero un control que normaliza un ataque en vez de
  // rechazarlo depende de a dónde caiga, y eso no es un control.
  //
  // El defecto además estuvo escondido: con `fetch`, el cliente colapsa los `../` ANTES de mandar el
  // pedido, así que el servidor nunca los veía y el test pasaba. Apareció al pedir con `http` crudo,
  // que es lo que hace cualquiera que no use un navegador.
  let pedido
  try { pedido = decodeURIComponent(relativo) } catch { return denegar(res, 400, 'pedido mal formado') }
  if (pedido.includes('\0') || pedido.split(/[/\\]/).includes('..')) return denegar(res, 403, 'no')
  const destino = join(RAIZ_NOVNC, normalize(pedido))
  if (!destino.startsWith(RAIZ_NOVNC)) return denegar(res, 403, 'no')
  try {
    const cuerpo = await readFile(destino)
    const ext = destino.slice(destino.lastIndexOf('.'))
    res.writeHead(200, { 'content-type': TIPOS[ext] || 'application/octet-stream', 'cache-control': 'public, max-age=3600' })
    res.end(cuerpo)
  } catch { denegar(res, 404, 'no está') }
}

export function crearServidorRemoto({ cfg = configRuntime(), env = process.env, log = console } = {}) {
  const server = http.createServer(async (req, res) => {
    const ruta = soloRuta(req.url)
    if (ruta === RUTA_BASE || ruta === `${RUTA_BASE}/`) {
      const v = verificarToken(tokenDeUrl(req.url), { env })
      // El motivo se le muestra a quien abre el enlace: "venció" y "no es válido" piden cosas
      // distintas. El token en sí NUNCA se escribe en un log.
      if (!v.valido) return denegar(res, 403, `${v.motivo}.`)
      const clave = await claveEscritorio(cfg)
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      return res.end(paginaRemota({ token: tokenDeUrl(req.url), clave }))
    }
    if (ruta.startsWith(`${RUTA_BASE}/vendor/`)) return servirEstatico(res, ruta.slice(`${RUTA_BASE}/vendor/`.length))
    return denegar(res, 404, 'No encontré esa página.')
  })

  // ── EL PUENTE ─────────────────────────────────────────────────────────────────────────────────
  server.on('upgrade', (req, socket) => {
    if (soloRuta(req.url) !== `${RUTA_BASE}/ws`) { socket.destroy(); return }
    const v = verificarToken(tokenDeUrl(req.url), { env })
    if (!v.valido) {
      // 403 ANTES del apretón de manos. Aceptarlo y cerrarlo después dejaría la conexión abierta un
      // instante contra el VNC, que es justo lo que el token tiene que impedir.
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    if (!responderApreton(socket, req.headers)) return

    const vnc = net.connect(cfg.puertoVnc, '127.0.0.1')
    let pendiente = Buffer.alloc(0)
    let vivo = true
    const cerrar = () => { if (!vivo) return; vivo = false; socket.destroy(); vnc.destroy() }

    vnc.on('connect', () => log.info?.('[balanz-remoto] escritorio conectado'))
    vnc.on('data', (d) => { if (vivo) socket.write(armarTrama(d, OPCODE.BINARIO)) })
    vnc.on('error', (e) => { log.warn?.(`[balanz-remoto] el escritorio no responde: ${e.message}`); cerrar() })
    vnc.on('close', cerrar)

    socket.on('data', (d) => {
      pendiente = Buffer.concat([pendiente, d])
      const { tramas, resto, invalida } = leerTramas(pendiente)
      if (invalida) return cerrar()
      pendiente = resto
      for (const t of tramas) {
        if (t.opcode === OPCODE.CIERRE) return cerrar()
        if (t.opcode === OPCODE.PING) { socket.write(armarTrama(t.carga, OPCODE.PONG)); continue }
        if (t.opcode === OPCODE.PONG) continue
        // Binario o continuación: al escritorio, sin mirar qué es.
        vnc.write(t.carga)
      }
    })
    socket.on('error', cerrar)
    socket.on('close', cerrar)
  })

  return server
}

// ── ARRANQUE ──────────────────────────────────────────────────────────────────────────────────────

function escuchar(server, log = console) {
  const socketPath = process.env.BALANZ_REMOTO_SOCKET || '/home/jorge/.local/run/echegaray/balanz.sock'
  // Un socket viejo de una corrida anterior impide el bind aunque no haya nadie del otro lado. Se
  // comprueba si está VIVO antes de borrarlo: borrar el socket de un proceso sano lo dejaría mudo.
  if (fs.existsSync(socketPath)) {
    const s = net.connect(socketPath)
    s.on('connect', () => { s.end(); log.error('[balanz-remoto] ya hay un servidor escuchando en ese socket'); process.exit(1) })
    s.on('error', () => { fs.unlinkSync(socketPath); arrancar() })
    return
  }
  arrancar()
  function arrancar() {
    server.listen(socketPath, () => {
      // 0660: Caddy entra como root en su contenedor y lo abre; nadie más en la VM.
      try { fs.chmodSync(socketPath, 0o660) } catch { /* el bind ya ocurrió */ }
      log.info(`[balanz-remoto] escuchando en ${socketPath} (ruta ${RUTA_BASE})`)
    })
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const server = crearServidorRemoto({})
  escuchar(server)
  for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { server.close(() => process.exit(0)) })
}
