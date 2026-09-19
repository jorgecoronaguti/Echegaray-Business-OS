#!/usr/bin/env node
// RECONSTRUYE EL ESQUEMA COMPLETO DEL OS SOBRE UNA BASE VACÍA, SIN INTERVENCIÓN MANUAL.
//
//   node orquestador/scripts/reconstruir-desde-cero.mjs --url postgres://... [--con-semilla]
//
// El camino completo (probado el 22/08/2026 contra supabase/postgres:17.6.1.165):
//
//   docker run -d --name pg-reprod -e POSTGRES_PASSWORD=x -p 127.0.0.1:55452:5432 \
//     supabase/postgres:17.6.1.165
//   until [ "$(docker inspect --format '{{.State.Health.Status}}' pg-reprod)" = healthy ]; do sleep 2; done
//   # ↑ healthy, no pg_isready: el init de la imagen sigue corriendo cuando el puerto ya responde,
//   #   y aplicar el bootstrap en esa ventana pisa la carrera (hallazgo del auditor, 22/08)
//   docker exec -i pg-reprod psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
//     < supabase/bootstrap/entorno-plataforma.sql          # como superusuario: piezas de plataforma
//   node orquestador/scripts/reconstruir-desde-cero.mjs \
//     --url postgres://postgres:x@127.0.0.1:55452/postgres --con-semilla
//
// Tres piezas, en este orden:
//   1. supabase/bootstrap/entorno-plataforma.sql — lo que en Supabase hosted provee la PLATAFORMA
//      (pg_cron, auth.users, funciones auth.* versión hosted, storage mínimo, privilegios por
//      defecto). Se aplica APARTE como superusuario; este script lo verifica, no lo aplica.
//   2. supabase/migrations/*.sql — la cadena entera, en orden de nombre, cada archivo en su
//      transacción, con constancia en public.migracion_aplicada (el ledger de aplicar-migracion.mjs).
//   3. supabase/bootstrap/semilla-minima.sql — sólo con --con-semilla: identidades y Base Maestra
//      mínimas para que el circuito sea ejercitable en un entorno de prueba. NUNCA en producción.
//
// ═══ ESTE SCRIPT NO ES PARA PRODUCCIÓN ═══
// Producción ya está construida; acá sólo se levantan entornos nuevos. Por eso el candado: sin
// `--si-remoto` se niega a hablar con cualquier host que no sea local, y aún local se niega si
// encuentra tablas de negocio sin su propio ledger (una base que no construyó él, no la toca).

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { esUrlLocal, decisionSobreBase, semillaPermitida, PREFIJO_SEMILLA } from '../lib/reconstruccion-candados.mjs'
import { partirSentencias, esErrorDeDatos, degradarAfirmacionesDeDatos } from '../lib/sql-sentencias.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..')
const DIR_MIGRACIONES = join(RAIZ, 'supabase', 'migrations')
const DIR_BOOTSTRAP = join(RAIZ, 'supabase', 'bootstrap')

const args = process.argv.slice(2)
const url = args[args.indexOf('--url') + 1]
if (!args.includes('--url') || !url || url.startsWith('--')) {
  console.error('falta --url postgres://… (no se lee DATABASE_URL a propósito: esa apunta a producción)')
  process.exit(1)
}
if (!esUrlLocal(url) && !args.includes('--si-remoto')) {
  console.error('la URL no es local. Reconstruir un host remoto exige decirlo: --si-remoto')
  process.exit(1)
}

// ═══ --sin-datos: UNA BASE DE DESARROLLO NO TIENE LOS DATOS QUE PRODUCCIÓN AFIRMA (18/09/2026) ═══
//
// 62 migraciones terminan con un bloque `do $$ … if n <> 6 then raise exception … $$` que verifica que la
// transformación de DATOS salió como se esperaba EN PRODUCCIÓN («esperaba 6 análisis … hay 0»). Sobre una
// base sin esos datos la afirmación falla, la transacción se deshace —incluido el DDL del mismo archivo— y
// la cadena se corta, aunque el ESQUEMA que la migración construye sea perfectamente reproducible.
//
// Con `--sin-datos`, y SÓLO sobre una base local, una migración que falla con SQLSTATE P0001 (un `raise
// exception` propio, no un error de esquema) se reintenta con los `raise exception` de sus bloques `do`
// degradados a `raise warning`. Las funciones que la migración crea NO se tocan: la degradación se aplica
// únicamente dentro de `do $tag$ … $tag$`. Queda constancia doble: en el ledger (`aplicada_por`) y en
// `supabase/migrations/AFIRMAN-DATOS.txt`, que este runner escribe y se commitea — la lista enumerable de
// qué afirmaciones no se pueden verificar sin datos reales. Lo mismo vale para un `insert` con ids de
// producción (clave foránea) o un único: se aplica SENTENCIA POR SENTENCIA con savepoint, se omite la de
// datos y el esquema del mismo archivo queda aplicado (`aplicarSinDatos`). Un error de esquema (columna inexistente, tipo
// que no cierra) sigue cortando la cadena: eso sí es un defecto de reproducibilidad.
const SIN_DATOS = args.includes('--sin-datos')
if (SIN_DATOS && !esUrlLocal(url)) {
  console.error('--sin-datos sólo vale sobre una base local: degrada afirmaciones, jamás sobre producción')
  process.exit(1)
}
const LISTA_AFIRMAN = join(DIR_MIGRACIONES, 'AFIRMAN-DATOS.txt')
/**
 * SENTENCIA POR SENTENCIA, CON SAVEPOINT. Una sentencia que falla por DATOS (clave foránea a un id de
 * producción, único, `raise exception` de un `do`) se omite y se anota; el resto del archivo —el esquema—
 * se aplica. Un `do` que afirma datos se reintenta con la afirmación degradada a warning antes de omitirlo.
 * Cualquier error de ESQUEMA corta la cadena como siempre. Devuelve las sentencias omitidas.
 */
const ES_DATO_DE_CRON = /\bcron\.(unschedule|alter_job)\s*\(/i
async function aplicarSinDatos(c, sql) {
  const omitidas = []
  for (const s of partirSentencias(sql)) {
    await c.query('savepoint sd')
    try { await c.query(s); await c.query('release savepoint sd'); continue } catch (e) {
      await c.query('rollback to savepoint sd')
      if (e.code === 'P0001' && /^do\b/i.test(s)) {
        try { await c.query(degradarAfirmacionesDeDatos(s)); await c.query('release savepoint sd'); omitidas.push(`afirmación degradada: ${e.message}`); continue } catch (e2) {
          await c.query('rollback to savepoint sd'); if (!esErrorDeDatos(e2.code)) throw e2; e = e2
        }
      }
      // Un `cron.unschedule(<id de producción>)` es DATO del scheduler de producción, no esquema.
      if (!esErrorDeDatos(e.code) && !ES_DATO_DE_CRON.test(s)) throw e
      omitidas.push(`${s.slice(0, 60).replace(/\s+/g, ' ')}… → ${e.code} ${e.message}`)
    }
    await c.query('release savepoint sd').catch(() => {})
  }
  return omitidas
}
function anotarAfirmaDatos(archivo, motivo) {
  let actual = ''
  try { actual = readFileSync(LISTA_AFIRMAN, 'utf8') } catch { /* primera vez */ }
  if (actual.includes(archivo)) return
  const cabecera = actual ? '' : '# Migraciones cuyas afirmaciones de DATOS no se pueden verificar en una base sin datos reales.\n'
    + '# Las escribe reconstruir-desde-cero.mjs --sin-datos: el esquema se aplicó; la afirmación quedó como warning.\n'
    + '# archivo <TAB> lo que afirmaba\n'
  writeFileSync(LISTA_AFIRMAN, `${actual}${cabecera}${archivo}\t${motivo.replace(/\s+/g, ' ').slice(0, 160)}\n`)
}

const LEDGER = `create table if not exists public.migracion_aplicada (
  archivo text primary key, hash text not null,
  aplicada_en timestamptz not null default now(), aplicada_por text)`
const hashDe = (sql) => createHash('sha256').update(sql).digest('hex').slice(0, 16)

const c = new pg.Client({ connectionString: url })
await c.connect()

// ── el candado: una base con negocio y sin ledger propio no se toca ──
const { rows: [censo] } = await c.query(`select
  (select count(*)::int from pg_tables where schemaname = 'public') as tablas,
  (to_regclass('public.migracion_aplicada') is not null)            as con_ledger`)
const decision = decisionSobreBase({ tablas: censo.tablas, conLedger: censo.con_ledger })
if (!decision.seguir) {
  console.error(decision.motivo)
  await c.end(); process.exit(1)
}

// ── 1. el bootstrap tiene que estar aplicado (como superusuario, por fuera) ──
const { rows: [sustrato] } = await c.query(`select
  (select count(*) from pg_extension where extname = 'pg_cron')  as cron,
  (to_regclass('auth.users') is not null)                        as auth_users,
  (to_regclass('storage.buckets') is not null)                   as storage`)
if (!Number(sustrato.cron) || !sustrato.auth_users || !sustrato.storage) {
  console.error('falta el bootstrap de plataforma. Aplicarlo como superusuario y volver:\n' +
    `  psql -v ON_ERROR_STOP=1 < ${join(DIR_BOOTSTRAP, 'entorno-plataforma.sql')}`)
  await c.end(); process.exit(1)
}

// ── 2. la cadena entera, con constancia ──
await c.query(LEDGER)
const { rows } = await c.query('select archivo, hash from public.migracion_aplicada')
const aplicadas = new Map(rows.map((r) => [r.archivo, r.hash]))
const archivos = readdirSync(DIR_MIGRACIONES).filter((f) => f.endsWith('.sql')).sort()

let ok = 0
let saltadas = 0
for (const f of archivos) {
  const sql = readFileSync(join(DIR_MIGRACIONES, f), 'utf8')
  const h = hashDe(sql)
  if (aplicadas.get(f) === h) { saltadas++; continue }
  // `create index concurrently` no puede vivir en una transacción: ese archivo se aplica sentencia por
  // sentencia en autocommit (es lo que hizo producción: su hash en el ledger es de otra herramienta).
  if (/create\s+index\s+concurrently/i.test(sql)) {
    try {
      for (const sentencia of partirSentencias(sql)) await c.query(sentencia)
      await c.query(
        `insert into public.migracion_aplicada (archivo, hash, aplicada_por) values ($1, $2, 'reconstruir-desde-cero (autocommit: index concurrently)')
         on conflict (archivo) do update set hash = excluded.hash, aplicada_en = now()`, [f, h])
      ok++
      continue
    } catch (e) {
      console.error(`✗ la cadena se cortó en ${f} (autocommit):\n  ${e.message}`)
      await c.end(); process.exit(1)
    }
  }
  try {
    await c.query('begin')
    await c.query(sql)
    await c.query(
      `insert into public.migracion_aplicada (archivo, hash, aplicada_por) values ($1, $2, 'reconstruir-desde-cero')
       on conflict (archivo) do update set hash = excluded.hash, aplicada_en = now()`, [f, h])
    await c.query('commit')
    ok++
  } catch (e) {
    await c.query('rollback').catch(() => {})
    if (SIN_DATOS && (esErrorDeDatos(e.code) || ES_DATO_DE_CRON.test(sql))) {
      try {
        await c.query('begin')
        const omitidas = await aplicarSinDatos(c, sql)
        await c.query(
          `insert into public.migracion_aplicada (archivo, hash, aplicada_por) values ($1, $2, $3)
           on conflict (archivo) do update set hash = excluded.hash, aplicada_en = now()`,
          [f, h, `reconstruir --sin-datos: ${omitidas.length} sentencia(s) de datos omitidas`])
        await c.query('commit')
        anotarAfirmaDatos(f, omitidas.join(' | ') || e.message)
        console.warn(`⚠ ${f}: ${omitidas.length} sentencia(s) de datos omitidas (esquema aplicado). Primera: ${(omitidas[0] || e.message).slice(0, 110)}`)
        ok++
        continue
      } catch (e2) {
        await c.query('rollback').catch(() => {})
        console.error(`✗ la cadena se cortó en ${f} (error de ESQUEMA, aun omitiendo datos):\n  ${e2.message}`)
        console.error(`  (${saltadas} ya estaban, ${ok} aplicadas en esta corrida; al corregir, relanzar: continúa desde acá)`)
        await c.end(); process.exit(1)
      }
    }
    console.error(`✗ la cadena se cortó en ${f}:\n  ${e.message}`)
    console.error(`  (${saltadas} ya estaban, ${ok} aplicadas en esta corrida; al corregir, relanzar: continúa desde acá)`)
    await c.end(); process.exit(1)
  }
}

// ── 3. la semilla, sólo si se pidió — y sólo en una base SIN GENTE REAL ──
// El candado de arriba no alcanza acá: una base productiva alcanzada por túnel local con las 258
// hasheadas pasa los dos candados sin aplicar nada… y la semilla insertaría cuentas de prueba en
// producción. La regla: si perfiles tiene UNA sola fila que no sea de la propia semilla, no hay
// semilla — un entorno de prueba recién reconstruido no tiene a nadie.
if (args.includes('--con-semilla')) {
  const { rows: [gente] } = await c.query(
    `select count(*)::int as ajenos from public.perfiles where id::text not like $1`,
    [`${PREFIJO_SEMILLA}%`])
  const veredicto = semillaPermitida({ perfilesAjenos: gente.ajenos })
  if (!veredicto.permitida) {
    console.error(`✗ sin semilla: ${veredicto.motivo}`)
    await c.end(); process.exit(1)
  }
  await c.query(readFileSync(join(DIR_BOOTSTRAP, 'semilla-minima.sql'), 'utf8'))
  console.log('semilla mínima aplicada (identidades + Base Maestra de prueba)')
}

console.log(`✓ cadena completa: ${saltadas} ya estaban, ${ok} aplicadas ahora, total ${archivos.length}`)
console.log('verificación sugerida: DATABASE_URL=<esta url> ORQ_DB_SSL=false node --test orquestador/lib/caso-controlado-circuito.pg.test.mjs')
await c.end()
