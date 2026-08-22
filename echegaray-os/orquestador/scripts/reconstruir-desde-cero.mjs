#!/usr/bin/env node
// RECONSTRUYE EL ESQUEMA COMPLETO DEL OS SOBRE UNA BASE VACÍA, SIN INTERVENCIÓN MANUAL.
//
//   node orquestador/scripts/reconstruir-desde-cero.mjs --url postgres://... [--con-semilla]
//
// El camino completo (probado el 22/08/2026 contra supabase/postgres:17.6.1.165):
//
//   docker run -d --name pg-reprod -e POSTGRES_PASSWORD=x -p 127.0.0.1:55452:5432 \
//     supabase/postgres:17.6.1.165
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

import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

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
const esLocal = /@(127\.0\.0\.1|localhost)[:/]/.test(url)
if (!esLocal && !args.includes('--si-remoto')) {
  console.error('la URL no es local. Reconstruir un host remoto exige decirlo: --si-remoto')
  process.exit(1)
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
if (censo.tablas > 0 && !censo.con_ledger) {
  console.error(`la base ya tiene ${censo.tablas} tablas en public y ningún ledger de este mecanismo: no es vacía ni mía. No se toca.`)
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
    console.error(`✗ la cadena se cortó en ${f}:\n  ${e.message}`)
    console.error(`  (${saltadas} ya estaban, ${ok} aplicadas en esta corrida; al corregir, relanzar: continúa desde acá)`)
    await c.end(); process.exit(1)
  }
}

// ── 3. la semilla, sólo si se pidió ──
if (args.includes('--con-semilla')) {
  await c.query(readFileSync(join(DIR_BOOTSTRAP, 'semilla-minima.sql'), 'utf8'))
  console.log('semilla mínima aplicada (identidades + Base Maestra de prueba)')
}

console.log(`✓ cadena completa: ${saltadas} ya estaban, ${ok} aplicadas ahora, total ${archivos.length}`)
console.log('verificación sugerida: DATABASE_URL=<esta url> ORQ_DB_SSL=false node --test orquestador/lib/caso-controlado-circuito.pg.test.mjs')
await c.end()
