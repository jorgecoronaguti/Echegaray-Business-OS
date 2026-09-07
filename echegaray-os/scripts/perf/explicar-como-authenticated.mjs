// EXPLAIN ANALYZE de una consulta COMO `authenticated`, con los claims del usuario real.
// Medir como owner o service_role no prueba nada: la RLS no se evalúa.
import { getPool, closePool } from '../../orquestador/lib/db.mjs'
const pool = getPool()
const c = await pool.connect()
const EMAIL = process.env.PERF_EMAIL ?? 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const { rows: [u] } = await c.query(`select id::text, email from auth.users where email = $1`, [EMAIL])
if (!u) { console.error('sin usuario'); process.exit(1) }
const claims = JSON.stringify({ sub: u.id, email: u.email, role: 'authenticated' })
const sql = process.argv[2]
const analizar = process.argv[3] !== '--plan'
await c.query('begin')
await c.query(`select set_config('request.jwt.claims', $1, true)`, [claims])
await c.query(`select set_config('role', 'authenticated', true)`)
await c.query(`set local role authenticated`)
const t0 = Date.now()
const { rows } = await c.query(`explain (${analizar ? 'analyze, buffers, ' : ''}costs off) ${sql}`)
console.log(`— ${Date.now() - t0} ms de pared —`)
for (const r of rows) console.log(r['QUERY PLAN'])
await c.query('rollback')
c.release()
await closePool()
