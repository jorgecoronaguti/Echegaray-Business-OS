// LO QUE COMPARTEN `estado` Y `barrer`: leer la máquina y reconocer qué proceso es de desarrollo.
//
// La lista de patrones de abajo es una LISTA BLANCA: sólo un proceso que matchea alguna de estas
// formas puede llegar a ser candidato a limpieza. Todo lo demás es invisible para el barrido, y
// además hay una lista de PROTEGIDOS que gana siempre, aunque el comando parezca de desarrollo.
// El error caro es matar algo productivo; el error barato es dejar vivo un huérfano un rato más.

import { readFileSync, readdirSync, readlinkSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const RAIZ = process.env.ECOS_RAIZ || join(homedir(), '.echegaray-os')
export const DIR = process.env.ECOS_DIR || join(RAIZ, 'recursos')
export const UID = process.getuid()

/** Formas de trabajo de desarrollo que este portero gobierna. Nada fuera de esto se toca. */
export const PATRONES_DESARROLLO = [
  { clase: 'next', re: /(^|\s|\/)next-server\b|(^|\/)\.bin\/next (dev|build)\b|(^|\s)next (dev|build)\b|npm (run dev|exec next dev)\b/ },
  { clase: 'browser', re: /ms-playwright\/.*chrome|chrome-headless-shell|(^|\/)playwright(\.js)? test\b|(^|\s)playwright test\b|npx playwright\b/ },
  { clase: 'validacion', re: /(^|\/)\.bin\/tsc\b|(^|\s)tsc --noEmit\b|(^|\/)typescript\/(lib|bin)\/tsc\b|(^|\/)\.bin\/eslint\b|\/eslint\/bin\/eslint\.js|(^|\s)eslint(\.js)?\s|(^|\s)node --test\b|npm run (typecheck|lint|build|orq:test)\b/ },
]

/** Lo que NUNCA se toca, aunque el comando parezca de desarrollo. Se mira cmdline y cgroup. */
export const PROTEGIDOS_CMD = [
  /mattermost/, /postgres/, /(^|\/)caddy\b/, /cloudflared/, /\/usr\/lib\/chromium\//, /chrome-balanz/,
  /\.vscode-server\//, /native-binary\/claude\b/, /(^|\s)claude\s/, /orquestador\/(worker|interactive-server|comunicacion\/)/, /deploy-comunicacion/,
  /(^|\s|\/)next start\b/, /\.bin\/next start\b/, /Xvfb|x11vnc|xvnc/i, /dockerd|containerd/, /systemd/,
  /sshd/, /ecos\.mjs|\/ecos\b/, /barrer\.mjs|estado\.mjs/,
]
export const PROTEGIDOS_CGROUP = [/\/echegaray-/, /\/docker/, /\/system\.slice\//, /\/init\.scope/]

export function medir() {
  const m = {}
  for (const l of readFileSync('/proc/meminfo', 'utf8').split('\n')) {
    const [k, v] = l.split(':'); if (v) m[k] = parseInt(v, 10)
  }
  const [c1, c5, c15] = readFileSync('/proc/loadavg', 'utf8').split(' ').map(Number)
  const swapTotal = m.SwapTotal || 0, swapUsado = swapTotal - (m.SwapFree || 0)
  return {
    memTotalMB: Math.round(m.MemTotal / 1024), memDispMB: Math.round(m.MemAvailable / 1024),
    swapTotalMB: Math.round(swapTotal / 1024), swapUsadoMB: Math.round(swapUsado / 1024),
    swapPct: swapTotal ? Math.round(swapUsado * 100 / swapTotal) : 0,
    carga1: c1, carga5: c5, carga15: c15,
  }
}

export function politica() {
  const out = {}
  for (const p of [join(DIR, 'politica.env'), join(new URL('.', import.meta.url).pathname, 'politica.env')]) {
    if (!existsSync(p)) continue
    for (const l of readFileSync(p, 'utf8').split('\n')) {
      const m = l.match(/^([A-Z0-9_]+)=(\d+)/); if (m) out[m[1]] = Number(m[2])
    }
    break
  }
  return out
}

function leer(p) { try { return readFileSync(p, 'utf8') } catch { return '' } }

/** Un proceso con lo mínimo para decidir sobre él. `null` si ya no existe o no es nuestro. */
export function proceso(pid) {
  const status = leer(`/proc/${pid}/status`); if (!status) return null
  const campo = (k) => (status.match(new RegExp(`^${k}:\\s*(.*)$`, 'm')) || [])[1] || ''
  const uid = parseInt(campo('Uid').split(/\s+/)[0], 10)
  if (uid !== UID) return null
  const cmd = leer(`/proc/${pid}/cmdline`).replace(/\0+$/, '').split('\0').join(' ')
  if (!cmd) return null
  let cwd = ''; try { cwd = readlinkSync(`/proc/${pid}/cwd`) } catch { cwd = '(inaccesible)' }
  const stat = leer(`/proc/${pid}/stat`)
  // El nombre del comando va entre paréntesis y puede tener espacios: se corta después del ÚLTIMO ")".
  const resto = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
  const ppid = parseInt(resto[1], 10)
  const arranque = parseInt(resto[19], 10)
  return {
    pid, ppid, cmd, cwd, arranque,
    rssMB: Math.round(parseInt(campo('VmRSS') || '0', 10) / 1024),
    cgroup: leer(`/proc/${pid}/cgroup`).trim(),
  }
}

export function pids() {
  return readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map(Number)
}

export function clasificar(p) {
  if (PROTEGIDOS_CMD.some((re) => re.test(p.cmd))) return { protegido: true }
  if (PROTEGIDOS_CGROUP.some((re) => re.test(p.cgroup))) return { protegido: true }
  const hit = PATRONES_DESARROLLO.find((x) => x.re.test(p.cmd))
  return hit ? { protegido: false, clase: hit.clase } : null
}

/** Todos los procesos de desarrollo vivos, ya clasificados. */
export function procesosDesarrollo() {
  const out = []
  for (const pid of pids()) {
    if (pid === process.pid) continue
    const p = proceso(pid); if (!p) continue
    const c = clasificar(p); if (!c || c.protegido) continue
    out.push({ ...p, clase: c.clase, enScope: /\/ecos\.slice\//.test(p.cgroup) })
  }
  return out
}

export const vivo = (pid) => existsSync(`/proc/${pid}`)

export function padreDe(pid) {
  const stat = leer(`/proc/${pid}/stat`); if (!stat) return 0
  return parseInt(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1], 10) || 0
}

/** Todos los descendientes vivos de un pid que no estén protegidos (mismo uid). */
export function descendientes(raiz) {
  const hijos = new Map()
  for (const pid of pids()) { const pp = padreDe(pid); if (pp) (hijos.get(pp) || hijos.set(pp, []).get(pp)).push(pid) }
  const out = [], cola = [...(hijos.get(raiz) || [])]
  while (cola.length) {
    const pid = cola.shift(); const p = proceso(pid); if (!p) continue
    const c = clasificar(p); if (c?.protegido) continue
    out.push({ ...p, clase: c?.clase || 'hijo' }); cola.push(...(hijos.get(pid) || []))
  }
  return out
}

/**
 * ¿Alguien responde por este proceso? Se sube por la cadena de padres hasta encontrar un DUEÑO —
 * una sesión de Claude Code, VS Code Server, una sesión SSH, un servicio de systemd— o hasta llegar
 * a PID 1. Si se llega a PID 1 sin dueño, nadie lo lanzó que siga vivo: es huérfano.
 * `bash`, `npm`, `node`, `sh` no cuentan como dueños: son la cadena, no quien la sostiene.
 */
export const DUENOS = [/native-binary\/claude\b/, /(^|\/)claude(\s|$)/, /\.vscode-server\//, /sshd/, /systemd/, /tmux|screen/]
export function tieneDueno(pid, cache = new Map()) {
  let p = pid, saltos = 0
  while (p > 1 && saltos++ < 64) {
    if (!cache.has(p)) cache.set(p, leer(`/proc/${p}/cmdline`).split('\0').join(' '))
    const cmd = cache.get(p)
    if (p !== pid && DUENOS.some((re) => re.test(cmd))) return true
    const stat = leer(`/proc/${p}/stat`); if (!stat) return false
    p = parseInt(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1], 10)
    if (!p) return false
  }
  return false
}

/** Registro de tareas gobernadas: {pid, clase, cwd, cmd, desde} por archivo. */
export function registros() {
  const dir = join(DIR, 'registro')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    try { return { archivo: join(dir, f), ...JSON.parse(readFileSync(join(dir, f), 'utf8')) } } catch { return null }
  }).filter(Boolean)
}

export const mb = (n) => `${n} MB`
