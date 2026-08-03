// RUNTIME DEL NAVEGADOR DE BALANZ — quién está vivo, qué se ve, y qué hacer al respecto.
//
// ═══ QUÉ PROBLEMA RESUELVE ═══
//
// El agente sabía conectarse a un CDP y leer pantallas. No sabía nada sobre el navegador en sí: si
// estaba arriba, si el display existía, si la pestaña seguía ahí, si había que reiniciarlo. Eso vivía
// en la cabeza del dueño y en un túnel SSH abierto desde su Mac.
//
// Este módulo es el dueño de esa capa. Contesta UNA pregunta —¿en qué estado está el navegador?— y
// deja que el ciclo financiero decida qué hacer con la respuesta.
//
// ═══ LA REGLA QUE GOBIERNA TODO EL ARCHIVO ═══
//
// **Un error nunca se convierte en un mercado vacío.** Ni el navegador caído, ni el display muerto,
// ni la sesión vencida, ni la pestaña perdida. Cada uno de esos tiene su estado propio y ninguno
// devuelve "cero instrumentos": la diferencia entre "el mercado no ofrece nada" y "no pude mirar el
// mercado" es la diferencia entre una recomendación y una mentira.
//
// ═══ LO QUE NO HACE ═══
//
// No inicia sesión, no completa formularios, no toca credenciales y no reconstruye `sessionStorage`.
// Cuando la sesión no está, lo dice y espera a una persona.

import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { esDominioBalanz } from './balanz-denylist.mjs'

const ejecutarCmd = promisify(execFile)

/** Los estados que el pedido exige. No hay ninguno que signifique "no sé pero seguí". */
export const ESTADO = {
  BROWSER_STARTING: 'BROWSER_STARTING',
  BROWSER_READY: 'BROWSER_READY',
  BALANZ_TARGET_MISSING: 'BALANZ_TARGET_MISSING',
  SESSION_REQUIRED: 'SESSION_REQUIRED',
  SESSION_ACTIVE: 'SESSION_ACTIVE',
  MARKET_RUNNING: 'MARKET_RUNNING',
  MARKET_READY: 'MARKET_READY',
  BROWSER_ERROR: 'BROWSER_ERROR',
  REMOTE_LOGIN_AVAILABLE: 'REMOTE_LOGIN_AVAILABLE',
}

/** Estados en los que NO hay que reiniciar el navegador: el navegador está bien, falta una persona. */
export const NO_REINICIAR = new Set([ESTADO.SESSION_REQUIRED, ESTADO.SESSION_ACTIVE, ESTADO.MARKET_RUNNING, ESTADO.MARKET_READY])

export const BASE_ESTADO = process.env.ORQ_BALANZ_BASE || '/home/jorge/.local/share/echegaray-os/balanz'

export function configRuntime(env = process.env) {
  const puertoCdp = Number(env.ORQ_BALANZ_PUERTO_CDP || 9222)
  return {
    contenedor: env.ORQ_BALANZ_CONTENEDOR || 'echegaray-balanz',
    imagen: env.ORQ_BALANZ_IMAGEN || 'echegaray-balanz-browser:1',
    red: env.ORQ_BALANZ_RED || 'balanz_net',
    puertoCdp,
    puertoVnc: Number(env.ORQ_BALANZ_PUERTO_VNC || 5900),
    endpoint: env.ORQ_BALANZ_CDP || `http://127.0.0.1:${puertoCdp}`,
    base: env.ORQ_BALANZ_BASE || BASE_ESTADO,
    urlInicial: env.ORQ_BALANZ_URL || 'https://clientes.balanz.com',
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SONDAS — cada una responde por UNA capa, y ninguna adivina por la de abajo
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** ¿Existe el contenedor y está corriendo? Se pregunta a Docker, no se infiere del CDP. */
export async function estadoContenedor(cfg = configRuntime(), ejecutar = ejecutarCmd) {
  try {
    const { stdout } = await ejecutar('docker', ['inspect', '-f', '{{.State.Status}}|{{.State.StartedAt}}|{{.State.Restarting}}', cfg.contenedor])
    const [status, desde, reiniciando] = String(stdout).trim().split('|')
    return { existe: true, corriendo: status === 'running', status, desde, reiniciando: reiniciando === 'true' }
  } catch (e) {
    const msg = String(e?.stderr || e?.message || e)
    if (/No such object|no such container/i.test(msg)) return { existe: false, corriendo: false, status: 'ausente' }
    return { existe: false, corriendo: false, status: 'desconocido', motivo: msg.slice(0, 160) }
  }
}

/** ¿Responde el puerto de depuración? */
export async function sondearCdp(endpoint, fetchImpl = fetch, ms = 3000) {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), ms)
    const r = await fetchImpl(`${endpoint}/json/version`, { signal: ctrl.signal }).finally(() => clearTimeout(t))
    if (!r.ok) return { vivo: false, motivo: `el endpoint respondió ${r.status}` }
    const v = await r.json()
    return { vivo: true, navegador: String(v.Browser || 'desconocido') }
  } catch (e) {
    return { vivo: false, motivo: String(e?.message ?? e).slice(0, 120) }
  }
}

/** Los targets abiertos. Sin Playwright: es una consulta HTTP, y el healthcheck tiene que ser barato. */
export async function listarTargets(endpoint, fetchImpl = fetch, ms = 3000) {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), ms)
    const r = await fetchImpl(`${endpoint}/json/list`, { signal: ctrl.signal }).finally(() => clearTimeout(t))
    if (!r.ok) return { ok: false, motivo: `list respondió ${r.status}`, targets: [] }
    const j = await r.json()
    return { ok: true, targets: Array.isArray(j) ? j : [] }
  } catch (e) {
    return { ok: false, motivo: String(e?.message ?? e).slice(0, 120), targets: [] }
  }
}

/**
 * LA PESTAÑA CANÓNICA. Es la única que puede tener sesión: Balanz la guarda en `sessionStorage`, que
 * es por pestaña, así que una pestaña nueva nace deslogueada por definición.
 *
 * El `service_worker` de Balanz (`ngsw-worker.js`) también aparece en la lista y también está en el
 * dominio. No es una pestaña, no tiene DOM y no se puede navegar: si se lo tomara por la pestaña
 * canónica, el agente creería tener target y no podría leer nada.
 */
export function pestanaCanonica(targets = []) {
  return targets.find((t) => t.type === 'page' && esDominioBalanz(String(t.url || ''))) || null
}

/** Las marcas de que la pestaña está en el ingreso. La URL alcanza y no exige abrir el DOM. */
export function urlEsLogin(url) {
  return /\/(login|signin|ingresar|auth)(\/|$|\?)/i.test(String(url || ''))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// DIAGNÓSTICO
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * EL DIAGNÓSTICO COMPLETO, de abajo hacia arriba: contenedor → CDP → targets → pestaña → sesión.
 * Se recorre en ese orden a propósito: cada capa explica la de arriba, y saltear una produce el
 * diagnóstico cómodo ("no hay sesión") cuando la verdad es otra ("no hay navegador").
 */
export async function diagnosticar(cfg = configRuntime(), deps = {}) {
  const { fetchImpl = fetch, ejecutar = ejecutarCmd } = deps
  const cont = await estadoContenedor(cfg, ejecutar)
  const cdp = await sondearCdp(cfg.endpoint, fetchImpl)

  if (!cdp.vivo) {
    // El contenedor puede estar arrancando: Chromium tarda unos segundos en abrir el puerto. Eso es
    // BROWSER_STARTING, no un error — y confundirlos hace que el vigía reinicie un navegador sano.
    if (cont.corriendo || cont.reiniciando) {
      return { estado: ESTADO.BROWSER_STARTING, contenedor: cont, cdp, detalle: 'el contenedor está arriba y el puerto de depuración todavía no responde' }
    }
    return {
      estado: ESTADO.BROWSER_ERROR,
      contenedor: cont,
      cdp,
      detalle: cont.existe ? `el contenedor está ${cont.status}` : 'el contenedor del navegador no existe',
    }
  }

  const lista = await listarTargets(cfg.endpoint, fetchImpl)
  if (!lista.ok) return { estado: ESTADO.BROWSER_ERROR, contenedor: cont, cdp, detalle: `no se pudieron listar las pestañas: ${lista.motivo}` }

  const page = pestanaCanonica(lista.targets)
  if (!page) {
    return {
      estado: ESTADO.BALANZ_TARGET_MISSING,
      contenedor: cont, cdp,
      targets: lista.targets.length,
      detalle: 'el navegador está vivo pero no hay ninguna pestaña de Balanz abierta',
    }
  }

  const url = String(page.url || '')
  if (urlEsLogin(url)) {
    return {
      estado: ESTADO.SESSION_REQUIRED,
      contenedor: cont, cdp, target: { id: page.id, url, titulo: page.title },
      detalle: 'la pestaña está en el ingreso de Balanz: hace falta que una persona inicie sesión',
    }
  }
  return {
    estado: ESTADO.SESSION_ACTIVE,
    contenedor: cont, cdp, target: { id: page.id, url, titulo: page.title },
    detalle: 'hay una pestaña de Balanz fuera del login',
    // NO ES UNA CERTEZA. La URL dice que no está en el login; que la sesión sirva lo decide
    // `verificarSesion` con el DOM a la vista, en el ciclo. Acá se informa una presunción barata para
    // el vigía, y se marca como tal para que nadie la use como prueba.
    presuncion: true,
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ACCIONES
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** Levanta el contenedor si no está. Idempotente: si ya corre, no lo toca. */
export async function arrancarNavegador(cfg = configRuntime(), deps = {}) {
  const { ejecutar = ejecutarCmd } = deps
  const cont = await estadoContenedor(cfg, ejecutar)
  if (cont.corriendo) return { arrancado: false, motivo: 'ya estaba corriendo' }

  await mkdir(join(cfg.base, 'perfil'), { recursive: true })
  await mkdir(join(cfg.base, 'estado'), { recursive: true })
  await ejecutar('docker', ['network', 'create', cfg.red]).catch(() => {})
  if (cont.existe) await ejecutar('docker', ['rm', '-f', cfg.contenedor]).catch(() => {})

  const uid = typeof process.getuid === 'function' ? process.getuid() : 1000
  const gid = typeof process.getgid === 'function' ? process.getgid() : 1000
  await ejecutar('docker', [
    'run', '-d',
    '--name', cfg.contenedor,
    // HOSTNAME FIJO. El candado del perfil de Chromium guarda el hostname; si cambia en cada
    // arranque, el navegador cree que el perfil está en uso "en otra computadora".
    '--hostname', 'balanz',
    '--network', cfg.red,
    // AMBOS PUERTOS ATADOS A 127.0.0.1 DE LA VM. Nunca 0.0.0.0: ni el CDP —que no pide
    // autenticación y da control total del navegador— ni el VNC pueden mirar a Internet.
    '-p', `127.0.0.1:${cfg.puertoCdp}:9223`,
    '-p', `127.0.0.1:${cfg.puertoVnc}:5900`,
    '--user', `${uid}:${gid}`,
    '-v', `${join(cfg.base, 'perfil')}:/profile`,
    '-v', `${join(cfg.base, 'estado')}:/estado`,
    '--shm-size=1g',
    // El sandbox de Chromium necesita crear espacios de nombres, y tanto el seccomp por defecto de
    // Docker como el AppArmor de esta VM lo impiden. Comprobado: con el perfil por defecto el
    // navegador muere con "Failed to move to new namespace"; con SYS_ADMIN también. Aflojar estos
    // dos es lo que permite mantener el sandbox ACTIVO — la alternativa era --no-sandbox, o sea
    // abrir Internet sin aislamiento de render. El contenedor sigue sin privilegios, sin
    // capacidades extra, con usuario no root y con su propia red.
    '--security-opt', 'apparmor=unconfined',
    '--security-opt', 'seccomp=unconfined',
    '--restart', 'unless-stopped',
    '--memory', '2g',
    cfg.imagen,
  ])
  return { arrancado: true }
}

/**
 * REINICIO. Es la única operación destructiva del módulo, y por eso pide un motivo y se niega a
 * correr en los estados donde el navegador está sano: reiniciar por una sesión vencida no la
 * recupera —la sesión vive en la pestaña— y encima borra la pantalla de login que el dueño tenía
 * abierta para autenticarse.
 */
export async function reiniciarNavegador(cfg = configRuntime(), { motivo = 'sin motivo', forzar = false, deps = {} } = {}) {
  const { ejecutar = ejecutarCmd } = deps
  if (!forzar) {
    const d = await diagnosticar(cfg, deps)
    if (NO_REINICIAR.has(d.estado)) {
      return { reiniciado: false, motivo: `el navegador está en ${d.estado}: reiniciarlo no arregla nada y borra la pantalla abierta` }
    }
  }
  await ejecutar('docker', ['rm', '-f', cfg.contenedor]).catch(() => {})
  const r = await arrancarNavegador(cfg, deps)
  return { reiniciado: true, motivo, ...r }
}

/**
 * RECREA LA PESTAÑA cuando no queda ninguna. Abre la portada y nada más: la sesión no se puede
 * reconstruir desde acá, así que lo que produce es una pantalla de login lista para que una persona
 * la use. Se niega a abrir una segunda si ya hay una, que es lo que rompería la sesión existente.
 */
export async function asegurarPestanaCanonica(cfg = configRuntime(), deps = {}) {
  const { fetchImpl = fetch } = deps
  const lista = await listarTargets(cfg.endpoint, fetchImpl)
  if (!lista.ok) return { creada: false, motivo: lista.motivo }
  if (pestanaCanonica(lista.targets)) return { creada: false, motivo: 'ya existe la pestaña canónica' }
  const r = await fetchImpl(`${cfg.endpoint}/json/new?${encodeURIComponent(cfg.urlInicial)}`, { method: 'PUT' })
    .catch((e) => ({ ok: false, statusText: String(e?.message ?? e) }))
  if (!r.ok) return { creada: false, motivo: `no se pudo abrir la pestaña: ${r.statusText || r.status}` }
  return { creada: true }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// CERROJO — para que el vigía no reinicie el navegador en mitad de una corrida
// ════════════════════════════════════════════════════════════════════════════════════════════════

export const CERROJO_VENCE_MS = 45 * 60 * 1000

export function rutaCerrojo(cfg = configRuntime()) { return join(cfg.base, 'estado', 'corrida.lock') }

/**
 * Toma el cerrojo. Un cerrojo vencido se pisa: un proceso muerto no puede soltar el suyo, y un
 * candado eterno deja al agente sin corridas para siempre — que es peor que la corrida solapada que
 * el candado evitaba.
 */
export async function tomarCerrojo(cfg = configRuntime(), { ahora = Date.now(), pid = process.pid } = {}) {
  const ruta = rutaCerrojo(cfg)
  await mkdir(join(cfg.base, 'estado'), { recursive: true }).catch(() => {})
  try {
    const crudo = await readFile(ruta, 'utf8')
    const prev = JSON.parse(crudo)
    if (ahora - Number(prev.tomado_en || 0) < CERROJO_VENCE_MS) {
      return { tomado: false, motivo: `hay una corrida en curso desde ${new Date(Number(prev.tomado_en)).toISOString()} (pid ${prev.pid})` }
    }
  } catch { /* no había cerrojo, o era ilegible: se toma igual */ }
  await writeFile(ruta, JSON.stringify({ pid, tomado_en: ahora }), 'utf8')
  return { tomado: true }
}

export async function soltarCerrojo(cfg = configRuntime()) {
  await unlink(rutaCerrojo(cfg)).catch(() => {})
}

export const VERSION_RUNTIME = '1.0.0'
