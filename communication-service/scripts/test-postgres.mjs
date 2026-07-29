#!/usr/bin/env node
// PR-3 · Runner de los tests de integración Postgres (M11).
//
// Levanta un Postgres EFÍMERO y DESCARTABLE en Docker (imagen postgres:16-alpine),
// aplica la migración del servicio, exporta PG_TEST_URL y corre los *.pg.test.mjs.
// Al terminar (o ante error) destruye el contenedor. NUNCA toca la base productiva.
//
// Correr:  npm run test:pg
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..')
const NOMBRE = `comm-pg-test-${process.pid}`
const PUERTO = 55432
const URL = `postgres://postgres:postgres@127.0.0.1:${PUERTO}/postgres`

const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts })

function arrancarContenedor() {
  console.log(`→ levantando Postgres efímero (${NOMBRE}) en :${PUERTO}…`)
  const r = sh('docker', ['run', '-d', '--rm', '--name', NOMBRE,
    '-e', 'POSTGRES_PASSWORD=postgres', '-p', `${PUERTO}:5432`, 'postgres:16-alpine'])
  if (r.status !== 0) throw new Error(`docker run falló: ${r.stderr || r.stdout}`)
}

function pararContenedor() {
  spawnSync('docker', ['rm', '-f', NOMBRE], { encoding: 'utf8' })
}

async function esperarListo(intentos = 40) {
  for (let i = 0; i < intentos; i++) {
    const c = new pg.Client({ connectionString: URL })
    try { await c.connect(); await c.query('select 1'); await c.end(); return } catch { await c.end().catch(() => {}) }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('Postgres no quedó listo a tiempo')
}

async function aplicarMigracion() {
  const sql = readFileSync(join(RAIZ, 'db/migrations/0001_comunicacion.sql'), 'utf8')
  const c = new pg.Client({ connectionString: URL })
  await c.connect(); await c.query(sql); await c.end()
  console.log('→ migración 0001 aplicada')
}

async function main() {
  arrancarContenedor()
  try {
    await esperarListo()
    await aplicarMigracion()
    console.log('→ corriendo *.pg.test.mjs…\n')
    const r = sh('node', ['--test', 'src/**/*.pg.test.mjs'], {
      cwd: RAIZ, stdio: 'inherit', env: { ...process.env, PG_TEST_URL: URL },
    })
    process.exitCode = r.status ?? 1
  } finally {
    pararContenedor()
    console.log('\n→ Postgres efímero destruido')
  }
}

main().catch((e) => { console.error(e); pararContenedor(); process.exit(1) })
