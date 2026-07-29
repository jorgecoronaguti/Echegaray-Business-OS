#!/usr/bin/env node
// PR-4 · Runner del test de integración vertical (Postgres REAL y DESCARTABLE).
//
// Levanta un Postgres efímero en Docker, aplica los esquemas orq (Work Fabric) +
// comunicacion (Communication Service), exporta el entorno y corre los
// *.pr4.test.mjs. Destruye el contenedor al terminar. NUNCA toca producción.
//
// Uso:  node orquestador/comunicacion/test-pr4.mjs
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'
import { aplicarEsquemaPR4 } from './aplicar-esquema.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..') // echegaray-os/
const NOMBRE = `pr4-pg-${process.pid}`
const PUERTO = 55442
const URL = `postgres://postgres:postgres@127.0.0.1:${PUERTO}/postgres`
const sh = (a, o = {}) => spawnSync('docker', a, { encoding: 'utf8', ...o })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function conectar() {
  for (let i = 0; i < 60; i++) {
    const c = new pg.Client({ connectionString: URL }); c.on('error', () => {})
    try { await c.connect(); await c.query('select 1'); return c } catch { try { await c.end() } catch {} ; await sleep(400) }
  }
  return null
}

async function main() {
  console.log(`→ Postgres efímero (${NOMBRE}) en :${PUERTO}…`)
  const r = sh(['run', '-d', '--rm', '--name', NOMBRE, '-e', 'POSTGRES_PASSWORD=postgres', '-p', `${PUERTO}:5432`, 'postgres:16-alpine'])
  if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1) }
  try {
    const c = await conectar()
    if (!c) throw new Error('Postgres no quedó listo')
    await aplicarEsquemaPR4(c)
    await c.end()
    console.log('→ esquemas orq + comunicacion aplicados\n')
    const run = spawnSync('node', ['--test', 'orquestador/comunicacion/*.pr4.test.mjs'], {
      cwd: RAIZ, stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: URL, ORQ_DB_SSL: '0', ORQ_CONCURRENCY: '8',
        PG_TEST_URL: URL, MM_INCOMING_SECRET: 'secreto-pr4-test', WORKER_ID: 'pr4-test' },
    })
    process.exitCode = run.status ?? 1
  } finally {
    sh(['rm', '-f', NOMBRE])
    console.log('\n→ Postgres efímero destruido')
  }
}

main().catch((e) => { console.error(e); sh(['rm', '-f', NOMBRE]); process.exit(1) })
