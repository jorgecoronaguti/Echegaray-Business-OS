import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificarEntorno, decidirConexion, esRutaDeDesarrollo, esWorktreeEnlazado, hidratarDesarrollo, nombreDeAplicacion, DESARROLLO, PRODUCCION } from './entorno.mjs'

const PROD_URL = 'postgresql://postgres.ref:pw@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'
const LOCAL_URL = 'postgres://postgres:x@127.0.0.1:55452/postgres'
const gitDir = { existe: (p) => p === '/home/j/app/.git', esArchivo: () => false }
const gitArchivo = { existe: (p) => p === '/home/j/app/wt-x/.git', esArchivo: () => true }

test('rutas de desarrollo por su forma', () => {
  for (const r of ['/home/j/app/.claude/worktrees/agent-1/echegaray-os', '/home/j/app/wt-haberes/echegaray-os', '/tmp/claude-1001/x', '/home/j/echegaray-os/worktrees/ui', '/home/j/app/echegaray-os-daily'])
    assert.equal(esRutaDeDesarrollo(r), true, r)
  for (const r of ['/home/jorge/echegaray-os/app/echegaray-os', '/home/jorge/echegaray-os/produccion/echegaray-os'])
    assert.equal(esRutaDeDesarrollo(r), false, r)
})

test('un worktree enlazado tiene .git archivo; el principal, directorio', () => {
  assert.equal(esWorktreeEnlazado('/home/j/app/wt-x/echegaray-os/orquestador', gitArchivo), true)
  assert.equal(esWorktreeEnlazado('/home/j/app/echegaray-os', gitDir), false)
})

test('clasifica: declaración > test > next dev > worktree > producción por descarte', () => {
  const base = { cwd: '/home/j/app/echegaray-os', execArgv: [], git: gitDir }
  assert.equal(clasificarEntorno({ ...base, env: { ECHEGARAY_ENTORNO: 'produccion' } }).declarado, true)
  assert.equal(clasificarEntorno({ ...base, env: { NODE_TEST_CONTEXT: 'child-v8' } }).entorno, DESARROLLO)
  assert.equal(clasificarEntorno({ ...base, env: {}, execArgv: ['--test'] }).entorno, DESARROLLO)
  assert.equal(clasificarEntorno({ ...base, env: { NODE_ENV: 'development' } }).entorno, DESARROLLO)
  assert.equal(clasificarEntorno({ ...base, env: {}, cwd: '/home/j/app/wt-x/echegaray-os', git: gitArchivo }).entorno, DESARROLLO)
  const p = clasificarEntorno({ ...base, env: {} })
  assert.equal(p.entorno, PRODUCCION); assert.equal(p.declarado, false)
  // worker.env NO puede declarar por el proceso: la declaración se lee del entorno REAL antes de hidratar
  assert.equal(clasificarEntorno({ ...base, env: { ECHEGARAY_ENTORNO: 'desarrollo' } }).entorno, DESARROLLO)
})

test('decide: local pasa · remota en producción pasa · remota en desarrollo sin declarar FRENA · declarada pasa', () => {
  assert.equal(decidirConexion({ url: LOCAL_URL, entorno: DESARROLLO, env: {} }).accion, 'pasa')
  assert.equal(decidirConexion({ url: PROD_URL, entorno: PRODUCCION, env: {} }).accion, 'pasa')
  const f = decidirConexion({ url: PROD_URL, entorno: DESARROLLO, env: {} })
  assert.equal(f.accion, 'frena'); assert.match(f.motivo, /pooler\.supabase\.com/); assert.doesNotMatch(f.motivo, /pw/)
  assert.equal(decidirConexion({ url: PROD_URL, entorno: DESARROLLO, declarado: true, env: {} }).accion, 'pasa')
  assert.equal(decidirConexion({ url: PROD_URL, entorno: DESARROLLO, env: { ORQ_TEST_DB_URL: PROD_URL } }).accion, 'pasa')
})

test('hidrata la base de desarrollo sólo en desarrollo, sin pisar y sin declaración de producción', () => {
  const des = { DATABASE_URL: LOCAL_URL }
  const env = {}
  const r = hidratarDesarrollo(env, { clasificacion: { entorno: DESARROLLO, declarado: false, motivo: 'test' }, desarrollo: des })
  assert.equal(r.hidratado, true); assert.equal(env.DATABASE_URL, LOCAL_URL); assert.equal(env.ORQ_TEST_DB_URL, LOCAL_URL); assert.equal(env.ORQ_DB_SSL, 'false')
  const env2 = { DATABASE_URL: PROD_URL }
  assert.equal(hidratarDesarrollo(env2, { clasificacion: { entorno: DESARROLLO, declarado: false }, desarrollo: des }).hidratado, false)
  assert.equal(env2.DATABASE_URL, PROD_URL)
  assert.equal(hidratarDesarrollo({}, { clasificacion: { entorno: PRODUCCION, declarado: false }, desarrollo: des }).hidratado, false)
  assert.equal(hidratarDesarrollo({}, { clasificacion: { entorno: DESARROLLO, declarado: true }, desarrollo: des }).hidratado, false)
  const sin = hidratarDesarrollo({}, { clasificacion: { entorno: DESARROLLO, declarado: false }, desarrollo: {} })
  assert.equal(sin.hidratado, false); assert.match(sin.motivo, /se frenará/)
})

test('la conexión de desarrollo se presenta como dev:<worktree>:<pid>', () => {
  assert.equal(nombreDeAplicacion({ entorno: DESARROLLO, cwd: '/home/j/app/wt-haberes/echegaray-os', pid: 7 }), 'dev:wt-haberes:7')
  assert.equal(nombreDeAplicacion({ entorno: PRODUCCION, workerId: 'vm:1' }), 'orq-worker:vm:1')
})
