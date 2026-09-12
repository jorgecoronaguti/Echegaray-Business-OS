#!/usr/bin/env node
// EL INSTRUMENTO DE LA OPTIMIZACIÓN — sin número de partida no hay optimización.
//
// Mide DOS caras del mismo problema y las guarda juntas en un JSON fechado:
//
//   (a) LA BASE   `pg_stat_statements`: top por tiempo total acumulado (lo que de verdad gasta la
//                 instancia) y top por tiempo medio (lo que de verdad se siente al abrir una
//                 pantalla). Las dos listas hacen falta: una consulta de 19 s llamada una vez no
//                 mueve el total, y una de 200 ms llamada 40.000 veces no aparece en la media.
//   (b) EL NAVEGADOR  con la identidad ADMIN de prueba (la misma de `tests/util/identidades.ts`,
//                 importada, nunca copiada), dos pasadas por ruta: la PRIMERA con el backend de
//                 PostgREST frío para esa pantalla, la SEGUNDA pegada a la primera. Ese par
//                 frío/caliente es el que expone el arranque en frío de Supabase.
//
// POR QUÉ UN SOLO WORKER Y CON `nice`: Mattermost corre en esta misma VM y el chat del dueño se cae
// si la medición la satura. Además, medir en paralelo mide la contención del medidor, no la app.
//
// EL NAVEGADOR VA PRIMERO Y LA BASE DESPUÉS, a propósito: así las dos mitades del JSON describen el
// MISMO evento. Con `--reset-antes` la ventana de `pg_stat_statements` arranca en cero justo antes de
// navegar, y entonces lo que sale en la lista es lo que costaron ESTAS rutas, no un promedio de 27
// horas de tráfico mezclado. Sin ese flag, la lista es la ventana histórica acumulada —que sirve
// para otra pregunta: qué gasta la instancia en un día entero.
//
// `--reset` (al final, después de escribir el archivo) deja la ventana limpia para la corrida
// siguiente. Nunca antes de guardar: eso borraría la medición que se acaba de tomar.
//
//   node orquestador/scripts/perf-baseline-web.mjs --etiqueta antes --reset-antes
//   node orquestador/scripts/perf-baseline-web.mjs --etiqueta historico --sin-navegador
//
// Opciones: --etiqueta <texto> · --base <url> · --rutas a,b,c · --reset-antes · --reset ·
//           --sin-navegador · --sin-base
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..')

/** Las diez rutas del marco de navegación que el dueño abre todos los días. NO incluye fichas con
 *  parámetro: una ficha mide además el dato de ESE cliente y deja de ser comparable entre corridas
 *  si alguien carga una orden nueva en el medio. */
const RUTAS_POR_DEFECTO = [
  '/obras',
  '/obras/gantt',
  '/clientes',
  '/administracion',
  '/administracion/compras',
  '/administracion/asistencia',
  '/administracion/proveedores',
  '/administracion/personas',
  '/documentos',
  '/calendario-financiero',
]

function opciones(argv) {
  const val = (nombre, porDefecto) => {
    const i = argv.indexOf(`--${nombre}`)
    return i >= 0 && argv[i + 1] ? argv[i + 1] : porDefecto
  }
  return {
    etiqueta: val('etiqueta', 'antes'),
    base: val('base', process.env.PERF_BASE_URL ?? 'https://app.ecsas.com.ar'),
    rutas: val('rutas', '') ? val('rutas', '').split(',') : RUTAS_POR_DEFECTO,
    reset: argv.includes('--reset'),
    resetAntes: argv.includes('--reset-antes'),
    sinNavegador: argv.includes('--sin-navegador'),
    sinBase: argv.includes('--sin-base'),
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// (a) LA BASE
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Las sentencias de esta medición no se miden a sí mismas: un control nunca se valida contra la
 *  información que produce. `pg_stat_statements` y `pg_stat_user_tables` quedan afuera. */
const SIN_EL_MEDIDOR = `query not like '%pg_stat_statements%' and query not like '%pg_stat_user_tables%'`

const COLUMNAS = `
  queryid::text as id,
  left(regexp_replace(query, '\\s+', ' ', 'g'), 220) as consulta,
  calls as llamadas,
  round(total_exec_time)::int as total_ms,
  round(mean_exec_time::numeric, 1)::float8 as media_ms,
  round(max_exec_time)::int as max_ms,
  rows as filas`

async function medirBase(query) {
  const ajustes = (await query(`
    select name, setting, unit from pg_settings
    where name in ('shared_buffers','work_mem','max_connections','effective_cache_size')
    order by name`)).rows

  const porTotal = (await query(`
    select ${COLUMNAS} from pg_stat_statements
    where ${SIN_EL_MEDIDOR} order by total_exec_time desc limit 20`)).rows

  const porMedia = (await query(`
    select ${COLUMNAS} from pg_stat_statements
    where ${SIN_EL_MEDIDOR} and calls >= 3 order by mean_exec_time desc limit 20`)).rows

  // Las tablas que se recorren enteras. `seq_scan` alto sobre una tabla con filas es el candidato
  // a índice; sobre una tabla de 20 filas es correcto y no hay nada que arreglar.
  const tablas = (await query(`
    select relname as tabla, seq_scan as recorridos, seq_tup_read as filas_leidas,
           coalesce(idx_scan, 0) as por_indice, n_live_tup as filas
    from pg_stat_user_tables
    where seq_scan > 0 and n_live_tup > 500
    order by seq_tup_read desc limit 20`)).rows

  const desde = (await query(`select stats_reset from pg_stat_statements_info`)).rows[0] ?? null

  return { ajustes, desde, porTotal, porMedia, tablas }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// (b) EL NAVEGADOR
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Los tiempos que el navegador sabe del documento. `doc` es el servidor esperando a la base —el
 *  número que el dueño siente como «no responde»— y está separado a propósito de `dcl`, que ya
 *  incluye bajar y ejecutar el JavaScript. */
function tiemposDelDocumento() {
  const n = performance.getEntriesByType('navigation')[0]
  return {
    doc: Math.round(n.responseEnd - n.responseStart),
    ttfb: Math.round(n.responseStart - n.startTime),
    dcl: Math.round(n.domContentLoadedEventEnd - n.startTime),
    load: Math.round(n.loadEventEnd - n.startTime),
  }
}

async function unaPasada(page, base, ruta) {
  const arranque = Date.now()
  const r = await page.goto(base + ruta, { waitUntil: 'domcontentloaded', timeout: 180_000 })
  // `networkidle` se mide a reloj de pared desde el `goto`: es lo que tarda la pantalla en dejar de
  // pedir cosas, que es cuando el usuario la puede usar. Si no llega, se deja el techo anotado en
  // vez de tirar la corrida: una ruta que no se calla es un hallazgo, no un error del medidor.
  let networkidle = -1
  try {
    await page.waitForLoadState('networkidle', { timeout: 60_000 })
    networkidle = Date.now() - arranque
  } catch { /* la pantalla no se calló en 60 s: queda anotado como -1 */ }
  // LOS TIEMPOS SE LEEN DESPUÉS DE QUE LA NAVEGACIÓN SE ASENTÓ. Si se leen justo después del
  // `goto`, una ruta que REDIRIGE (`/administracion` lo hace según el rol) destruye el contexto de
  // ejecución en el medio del `evaluate` y tira la corrida entera — perdiendo las nueve rutas que
  // ya se habían medido. Y además el dato que interesa es el del documento FINAL, el que el usuario
  // termina mirando, no el del 307 intermedio.
  const t = await page.evaluate(tiemposDelDocumento)
  return { estado: r?.status() ?? 0, url: page.url().replace(base, ''), ...t, networkidle }
}

async function medirNavegador(base, rutas) {
  const { chromium } = await import('playwright')
  const { ADMIN } = await import(join(RAIZ, 'tests', 'util', 'identidades.ts'))
  const navegador = await chromium.launch({ args: ['--no-sandbox'] })
  try {
    const page = await navegador.newPage()
    const entrada = Date.now()
    await page.goto(base + '/login', { waitUntil: 'domcontentloaded', timeout: 180_000 })
    await page.fill('input[name="email"]', ADMIN.email)
    await page.fill('input[name="password"]', ADMIN.password)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/(obras|clientes|flujo-caja|hoy|administracion)/, { timeout: 180_000 })
    const login = Date.now() - entrada

    const filas = []
    for (const ruta of rutas) {
      const frio = await unaPasada(page, base, ruta)
      const caliente = await unaPasada(page, base, ruta)
      filas.push({ ruta, frio, caliente })
      console.log(`  ${ruta.padEnd(34)} frío doc=${frio.doc}ms dcl=${frio.dcl}ms idle=${frio.networkidle}ms` +
        `  ·  caliente doc=${caliente.doc}ms dcl=${caliente.dcl}ms idle=${caliente.networkidle}ms`)
    }
    return { login, rutas: filas }
  } finally {
    await navegador.close()
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────

async function main() {
  const o = opciones(process.argv.slice(2))
  const fecha = new Date().toISOString()
  const salida = { etiqueta: o.etiqueta, fecha, base: o.base, db: null, web: null }

  let query = null
  if (!o.sinBase || o.reset || o.resetAntes) ({ query } = await import(join(RAIZ, 'orquestador', 'lib', 'db.mjs')))

  if (o.resetAntes) {
    await query('select pg_stat_statements_reset()')
    salida.ventana = 'sólo esta corrida (se reseteó pg_stat_statements antes de navegar)'
    console.log('pg_stat_statements reseteado — la ventana de la base arranca acá')
  } else {
    salida.ventana = 'histórica acumulada (no se reseteó)'
  }

  if (!o.sinNavegador) {
    console.log(`NAVEGADOR — ${o.base} · ${o.rutas.length} rutas · 1 worker`)
    salida.web = await medirNavegador(o.base, o.rutas)
  }

  if (!o.sinBase) {
    console.log('BASE — pg_stat_statements')
    salida.db = await medirBase(query)
    console.log(`  ${salida.db.porTotal.length} consultas por total · ${salida.db.porMedia.length} por media` +
      ` · estadísticas desde ${salida.db.desde?.stats_reset ?? 'desconocido'}`)
  }

  const dir = join(RAIZ, 'orquestador', 'datos', 'perf')
  mkdirSync(dir, { recursive: true })
  const archivo = join(dir, `perf-web-${o.etiqueta}-${fecha.replace(/[:.]/g, '-')}.json`)
  writeFileSync(archivo, JSON.stringify(salida, null, 2))
  console.log(`\nGUARDADO ${archivo}`)

  // Recién ahora: el archivo ya existe en disco, así que el reset no se puede comer la medición.
  if (o.reset) {
    await query('select pg_stat_statements_reset()')
    console.log('pg_stat_statements RESETEADO — el próximo «después» cuenta desde cero')
  }
  process.exit(0)
}

main().catch((e) => {
  console.error('FALLÓ LA MEDICIÓN:', e?.message ?? e)
  process.exit(1)
})
