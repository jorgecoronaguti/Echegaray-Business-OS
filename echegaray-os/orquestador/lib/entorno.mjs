// ENTORNO — ¿ESTE PROCESO ES DE DESARROLLO O DE PRODUCCIÓN? Y ENTONCES, ¿PUEDE HABLAR CON LA BASE REAL?
//
// ═══ EL DEFECTO QUE CIERRA (18/09/2026) ═══
//
// La base de Supabase estuvo caída de 12:03 a 12:35. No fue la VM: fueron 12 agentes de Claude Code con
// `next dev`, Playwright y la suite corriendo A LA VEZ contra la base de PRODUCCIÓN, más tres migraciones
// aplicadas a la base viva desde ramas sin mergear. Misma firma que las caídas del 12/09 y 13/09. La causa
// no es «muchos agentes»: es que desarrollo y producción usaban la misma base porque `config.mjs` hidrata
// `DATABASE_URL` desde `worker.env` para CUALQUIER proceso, incluido un test en un worktree.
//
// ═══ LA REGLA ═══
//
//   1. Un proceso de DESARROLLO —corre en un worktree, es un test, es `next dev`— NO se conecta a una base
//      remota salvo que lo declare: `ECHEGARAY_ENTORNO=produccion` en su entorno. Sin declaración, FALLA
//      antes de abrir el socket. Fail-closed.
//   2. Un proceso de PRODUCCIÓN —los servicios de systemd (llevan `ECHEGARAY_ENTORNO=produccion` por un
//      drop-in), el checkout de producción, el árbol principal del dueño— pasa como siempre.
//   3. Una base LOCAL (127.0.0.1 / localhost) pasa siempre: no hay nada que proteger.
//   4. En desarrollo, si nadie fijó `DATABASE_URL`, se hidrata desde `~/.config/echegaray-orq/desarrollo.env`
//      (pg-reprod, el Postgres local con el esquema de `origin/main`) ANTES de que `worker.env` pueda meter
//      la de producción. Así la suite y los scripts de un worktree van solos a la base de desarrollo.
//
// Todo lo decidible sin I/O es puro y tiene test. Lo que toca disco (`.git`, el archivo de desarrollo)
// está separado y es inyectable.

import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, basename } from 'node:path'
import { esUrlLocal } from './reconstruccion-candados.mjs'
import { baseDeclaradaDePrueba, enContextoDePrueba } from './guarda-base-de-prueba.mjs'
import { parseEnvFile } from '../../scripts/lib/env-file.mjs'

export const PRODUCCION = 'produccion'
export const DESARROLLO = 'desarrollo'
export const ARCHIVO_DESARROLLO = join(homedir(), '.config', 'echegaray-orq', 'desarrollo.env')

/** Rutas que son de desarrollo por su FORMA, sin mirar git. */
const RUTAS_DE_DESARROLLO = [
  /\/\.claude\/worktrees\//, /\/wt-[^/]+(\/|$)/, /\/worktrees\//, /^\/tmp\//, /\/orq-workspaces\//,
  /\/echegaray-os-daily(\/|$)/,
]
export const esRutaDeDesarrollo = (cwd) => RUTAS_DE_DESARROLLO.some((re) => re.test(String(cwd ?? '')))

/** Un worktree ENLAZADO tiene un `.git` que es ARCHIVO (apunta al repo principal); el árbol principal y un
 *  clon tienen un `.git` directorio. Se sube desde `cwd` hasta encontrar uno. Inyectable para test. */
export function esWorktreeEnlazado(cwd, { existe = existsSync, esArchivo = (p) => { try { return statSync(p).isFile() } catch { return false } } } = {}) {
  let d = String(cwd ?? '')
  for (let i = 0; d && i < 12; i++) {
    const g = join(d, '.git')
    if (existe(g)) return esArchivo(g)
    const padre = dirname(d); if (padre === d) break; d = padre
  }
  return false
}

/**
 * LA CLASIFICACIÓN. Devuelve { entorno, motivo, declarado }. `declarado` es true sólo con
 * `ECHEGARAY_ENTORNO=produccion` explícito: es la única llave que deja a un proceso de desarrollo hablar
 * con producción, y por eso se distingue de «produccion por descarte».
 */
export function clasificarEntorno({ env = process.env, cwd = process.cwd(), execArgv = process.execArgv, git = {} } = {}) {
  const decl = String(env.ECHEGARAY_ENTORNO ?? '').trim().toLowerCase()
  if (decl === PRODUCCION) return { entorno: PRODUCCION, motivo: 'declarado: ECHEGARAY_ENTORNO=produccion', declarado: true }
  if (decl === DESARROLLO) return { entorno: DESARROLLO, motivo: 'declarado: ECHEGARAY_ENTORNO=desarrollo', declarado: false }
  if (enContextoDePrueba(env, execArgv)) return { entorno: DESARROLLO, motivo: 'proceso de test (node --test)', declarado: false }
  if (String(env.NODE_ENV ?? '') === 'development') return { entorno: DESARROLLO, motivo: 'NODE_ENV=development (next dev)', declarado: false }
  if (esRutaDeDesarrollo(cwd)) return { entorno: DESARROLLO, motivo: `corre en un worktree (${cwd})`, declarado: false }
  if (esWorktreeEnlazado(cwd, git)) return { entorno: DESARROLLO, motivo: `corre en un worktree enlazado de git (${cwd})`, declarado: false }
  return { entorno: PRODUCCION, motivo: 'sin señales de desarrollo: árbol principal o checkout de producción', declarado: false }
}

/**
 * LA DECISIÓN SOBRE UNA CONEXIÓN. Pura.
 *   'pasa'  — se conecta
 *   'frena' — se lanza el error con `motivo` ANTES de abrir el socket
 */
export function decidirConexion({ url, entorno, declarado = false, env = process.env }) {
  if (!url) return { accion: 'pasa', motivo: 'sin URL: lo rechazará la configuración' }
  if (esUrlLocal(url)) return { accion: 'pasa', motivo: 'base local' }
  if (baseDeclaradaDePrueba(url, env)) return { accion: 'pasa', motivo: 'base declarada de prueba (ORQ_TEST_DB_URL)' }
  if (entorno === PRODUCCION || declarado) return { accion: 'pasa', motivo: 'proceso de producción' }
  return {
    accion: 'frena',
    motivo: 'CONEXIÓN A UNA BASE REMOTA DESDE UN PROCESO DE DESARROLLO, SIN DECLARAR.\n'
      + `  destino: ${resumirUrl(url)}\n`
      + '  Un test, un worktree o un `next dev` no hablan con producción por accidente: así se cayó la base el\n'
      + '  12/09, el 13/09 y el 18/09. Tres salidas, en este orden:\n'
      + `   1. usar la base de desarrollo: existe ${ARCHIVO_DESARROLLO} (pg-reprod) y se carga sola si no\n`
      + '      fijás DATABASE_URL en el entorno — revisá qué proceso la está fijando;\n'
      + '   2. si la tarea NECESITA producción (leer un dato real, aplicar una migración mergeada), declaralo:\n'
      + '      ECHEGARAY_ENTORNO=produccion <comando>   (queda a la vista en el proceso y en el registro);\n'
      + '   3. si es un servicio, corre con el drop-in de systemd `echegaray-.service.d/entorno.conf`.',
  }
}

function resumirUrl(url) {
  const m = /@([^/?]+)/.exec(String(url)); return m ? m[1] : '(url sin host)'
}

/** Lee el archivo de desarrollo, si existe. Devuelve {} si no. */
export function leerDesarrollo(archivo = ARCHIVO_DESARROLLO) {
  try { return parseEnvFile(readFileSync(archivo, 'utf8')) } catch { return {} }
}

/**
 * HIDRATA UN PROCESO DE DESARROLLO CON LA BASE DE DESARROLLO. Lo llama `config.mjs` ANTES de cargar
 * `worker.env`. No pisa nada que ya esté en el entorno. Devuelve qué hizo, para el registro.
 */
export function hidratarDesarrollo(env = process.env, { clasificacion = clasificarEntorno({ env }), desarrollo = leerDesarrollo() } = {}) {
  if (clasificacion.entorno !== DESARROLLO || clasificacion.declarado) return { hidratado: false, motivo: clasificacion.motivo }
  if (env.DATABASE_URL) return { hidratado: false, motivo: 'DATABASE_URL ya estaba en el entorno' }
  if (!desarrollo.DATABASE_URL) return { hidratado: false, motivo: `no existe ${ARCHIVO_DESARROLLO}: la conexión remota se frenará` }
  for (const [k, v] of Object.entries(desarrollo)) if (!(k in env)) env[k] = v
  // La base de desarrollo es, por definición, base de prueba: la guarda de escritura no tiene que actuar.
  if (!env.ORQ_TEST_DB_URL) env.ORQ_TEST_DB_URL = desarrollo.DATABASE_URL
  if (!env.ORQ_DB_SSL) env.ORQ_DB_SSL = 'false'
  return { hidratado: true, motivo: `${clasificacion.motivo} → base de desarrollo` }
}

/** Nombre con el que se presenta la conexión: en desarrollo, `dev:<worktree>:<pid>`; es lo que hace
 *  visible en `pg_stat_activity` de dónde viene cada conexión. */
export function nombreDeAplicacion({ entorno, cwd = process.cwd(), pid = process.pid, workerId = '' }) {
  if (entorno === DESARROLLO) {
    const wt = cwd.replace(/\/echegaray-os\/?$/, '')
    return `dev:${basename(wt)}:${pid}`
  }
  return `orq-worker:${workerId}`
}
