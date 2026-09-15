// ANTES DE INSERTAR «OBRA» EN EL SHEET REAL: qué tiene que ser cierto del mundo, y cómo se pregunta.
//
// ═══ POR QUÉ SON PRECONDICIONES Y NO UNA NOTA EN EL RUNBOOK (auditor, 15/09/2026) ═══
//
// Insertar corre una letra todo lo que está a la derecha de Compras L y Cobranzas H. Tres cosas convierten
// eso en daño, y ninguna la ve el script mirando sólo el Sheet:
//
//   1. un checkout que todavía lee POR POSICIÓN (producción atrasada ya pisó el Sheet: memoria
//      `produccion-es-otro-checkout`). Se corre DESDE producción y su HEAD tiene que traer este trabajo;
//   2. un timer o el worker escribiendo en el medio: la foto previa deja de ser la verdad y la comparación
//      da diferencias que no son de la inserción — o, peor, un generador viejo escribe en la letra corrida;
//   3. la migración 0700 sin aplicar: el sync nuevo no tiene dónde guardar la columna.
//
// No hay bandera para saltearlas. Si una no se cumple, se arregla el mundo, no el script.
//
// `evaluarPrecondiciones` es puro (se prueba con sondeos inventados); `sondearPrecondiciones` pregunta.

import { execFile } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

export const PRODUCCION = '/home/jorge/echegaray-os/produccion/echegaray-os'

export const TIMERS = Object.freeze([
  'echegaray-flujo-caja', 'echegaray-comprobantes-web', 'echegaray-comprobantes-vigia', 'echegaray-cobranzas-sync',
  'echegaray-compras-sync', 'echegaray-gmail-ordenes', 'echegaray-gmail-transferencias', 'echegaray-os-schedules',
  'echegaray-xsas-ciclo', 'echegaray-arca-sync',
])
/** Escribe Compras, pero todavía puede no estar instalado: si no existe, no frena; si existe, tiene que estar quieto. */
export const TIMERS_OPCIONALES = Object.freeze(['echegaray-compras-obra-cola'])
export const WORKER = 'echegaray-comunicacion-worker'

/** Lo que HEAD de producción tiene que traer, tal cual está en disco. `contiene`: la marca de lectura por rótulo. */
export const MARCAS = Object.freeze([
  { ruta: 'orquestador/lib/columnas-por-encabezado.mjs' },
  { ruta: 'orquestador/scripts/sync-cobranzas.mjs', contiene: 'leerColumnasCobranzas' },
  { ruta: 'orquestador/scripts/sheet-insertar-columna-obra.mjs', contiene: 'evaluarPrecondiciones' },
  { ruta: 'orquestador/lib/insercion-obra-precondiciones.mjs' },
  { ruta: 'orquestador/lib/formula-insertar-columna.mjs' },
  { ruta: 'orquestador/scripts/huellas-correr-columna.mjs' },
])

export const COLUMNAS_0700 = Object.freeze([
  'compra_sheet.destino', 'compra_sheet.obra_id', 'compra_sheet.obra_celda', 'compra_sheet.obra_inconsistencia',
  'costos_obra.destino', 'costos_obra.obra_id', 'cobranzas.destino', 'cobranzas.obra_id', 'cobranzas.obra_celda',
])

const QUIETO = new Set(['inactive', 'failed'])

function problemasDeCheckout({ cwd, script, checkout = {} }) {
  const mal = []
  if (cwd !== PRODUCCION) mal.push(`se corre desde ${cwd}: tiene que ser ${PRODUCCION}`)
  if (!String(script ?? '').startsWith(`${PRODUCCION}/`)) mal.push(`el script es ${script}: tiene que ser el del checkout de producción`)
  for (const m of MARCAS) {
    const c = checkout[m.ruta]
    if (!c || c.head === null) mal.push(`HEAD de producción no tiene ${m.ruta}: no trae este trabajo`)
    else if (c.head !== c.disco) mal.push(`${m.ruta} en producción difiere de su HEAD: hay cambios sin commitear`)
    else if (m.contiene && !c.head.includes(m.contiene)) mal.push(`${m.ruta} en HEAD de producción no tiene «${m.contiene}»: todavía lee por posición`)
  }
  return mal
}

function problemasDeUnidades(unidades = {}) {
  const mal = []
  const ver = (id, { opcional = false } = {}) => {
    const u = unidades[id]
    if (!u || u.load === 'not-found') { if (!opcional) mal.push(`${id} no existe: la lista de timers quedó vieja, no sigo a ciegas`); return }
    if (!QUIETO.has(u.active)) mal.push(`${id} está ${u.active}: detenelo antes de insertar`)
  }
  for (const t of TIMERS) { ver(`${t}.timer`); ver(`${t}.service`) }
  for (const t of TIMERS_OPCIONALES) { ver(`${t}.timer`, { opcional: true }); ver(`${t}.service`, { opcional: true }) }
  ver(`${WORKER}.service`)
  return mal
}

function problemasDeEsquema(esquema) {
  if (!esquema || esquema.error) return [`no pude leer el esquema de la base: ${esquema?.error ?? 'sin respuesta'}`]
  const mal = COLUMNAS_0700.filter((c) => !esquema.columnas?.includes(c)).map((c) => `falta la columna ${c}: la migración 0700 no está aplicada`)
  if (!esquema.cola) mal.push('falta public.compra_obra_cambio: la migración 0700 no está aplicada')
  if (!esquema.resolver) mal.push('falta public.obra_celda_resolver: la 0700 aplicada es la versión vieja')
  return mal
}

/**
 * @param {{cwd:string, script:string, checkout:Record<string,{head:string|null, disco:string|null}>,
 *   unidades:Record<string,{load:string, active:string}>, esquema:{columnas:string[], cola:boolean, resolver:boolean}|{error:string},
 *   error?:string}} s
 * @returns {string[]} lo que impide insertar; vacío = se puede
 */
export function evaluarPrecondiciones(s = {}) {
  if (s.error) return [`no pude verificar las precondiciones: ${s.error}`]
  return [...problemasDeCheckout(s), ...problemasDeUnidades(s.unidades), ...problemasDeEsquema(s.esquema)]
}

/** `systemctl --user show` de varias unidades → { id: {load, active} }. */
export function parsearShow(texto = '') {
  const out = {}
  for (const bloque of String(texto).split(/\n\s*\n/)) {
    const kv = Object.fromEntries(bloque.split('\n').map((l) => l.split('=')).filter((p) => p.length >= 2).map(([k, ...v]) => [k, v.join('=')]))
    if (kv.Id) out[kv.Id] = { load: kv.LoadState, active: kv.ActiveState }
  }
  return out
}

const SQL_ESQUEMA = `select
  coalesce((select array_agg(table_name || '.' || column_name) from information_schema.columns
             where table_schema = 'public' and table_name in ('compra_sheet', 'costos_obra', 'cobranzas')), '{}') as columnas,
  to_regclass('public.compra_obra_cambio') is not null as cola,
  to_regprocedure('public.obra_celda_resolver(text)') is not null as resolver`

const ejecutar = promisify(execFile)
const leerSiExiste = (f) => { try { return readFileSync(f, 'utf8') } catch { return null } }
const real = (p) => { try { return realpathSync(p) } catch { return p } }

/** Pregunta al mundo. Cada respuesta que falta entra como problema: nada se da por cumplido. */
export async function sondearPrecondiciones({ script, query, cwd = process.cwd() }) {
  const s = { cwd: real(cwd), script: real(script), checkout: {}, unidades: {}, esquema: null }
  for (const m of MARCAS) {
    const head = await ejecutar('git', ['-C', PRODUCCION, 'show', `HEAD:./${m.ruta}`], { maxBuffer: 64 * 1024 * 1024 })
      .then((r) => r.stdout).catch(() => null)
    s.checkout[m.ruta] = { head, disco: leerSiExiste(join(PRODUCCION, m.ruta)) }
  }
  const ids = [...TIMERS, ...TIMERS_OPCIONALES].flatMap((t) => [`${t}.timer`, `${t}.service`]).concat(`${WORKER}.service`)
  try {
    const r = await ejecutar('systemctl', ['--user', 'show', ...ids, '-p', 'Id', '-p', 'LoadState', '-p', 'ActiveState'])
    s.unidades = parsearShow(r.stdout)
  } catch (e) {
    return { ...s, error: `systemctl: ${e.message}` }
  }
  try {
    const { rows } = await query(SQL_ESQUEMA)
    s.esquema = rows?.[0] ?? { error: 'la consulta no devolvió filas' }
  } catch (e) {
    s.esquema = { error: e.message }
  }
  return s
}
