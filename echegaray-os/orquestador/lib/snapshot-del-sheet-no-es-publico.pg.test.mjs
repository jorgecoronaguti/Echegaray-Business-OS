// LAS FOTOS DEL SHEET DE LA EMPRESA NO LAS LEE CUALQUIER EMPLEADO CON UN LOGIN.
//
// ═══ EL DEFECTO ═══
//
// Lo encontró el inventario de privilegios del 31/08 mientras se cerraba el TRUNCATE. Cinco tablas
// del esquema `orq` estaban con `relrowsecurity = false`, cero policies y `select` concedido a
// `authenticated`:
//
//   orq.sheet_snapshots  50 MB · 2.397 filas — las fotos del 'Flujo de Caja - Cash Flow':
//                        la caja, los jornales y el margen por obra, celda por celda
//   orq.chat_result      584 kB — las respuestas del chat, que también llevan plata
//   orq.chat_cost        256 kB
//   orq.chat_request     152 kB
//   orq.chat_cache       136 kB
//
// Cualquiera con una sesión de la app las leía enteras. No es una fuga de un campo: es el Sheet
// entero, sin el portero por obra ni el portero económico que gobiernan el resto del OS.
//
// ═══ POR QUÉ ESTE ARREGLO Y NO OTRO ═══
//
// Las otras 19 tablas de `orq` YA tenían RLS. El patrón del esquema —`orq.google_tokens`,
// `orq.xsas_requests`— es RLS encendida con policy SÓLO para `service_role`: `authenticated`
// conserva el grant y recibe cero filas. Estas cinco simplemente nunca lo recibieron. Así que no se
// inventa un mecanismo: se les pone el que sus vecinas ya usan.
//
// Y además se revoca el `select`, porque las dos capas fallan distinto y las dos hacen falta:
// la RLS devuelve CERO FILAS (silencioso, se confunde con «no hay datos») y el REVOKE devuelve
// PERMISSION DENIED (ruidoso, se ve en el log). Este test acepta cualquiera de los dos como
// protección válida, y dice cuál actuó.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'

/** Las cinco que no tenían portero. `sheet_snapshots` va primera: es la que tiene la plata. */
const SENSIBLES = ['sheet_snapshots', 'chat_result', 'chat_cost', 'chat_request', 'chat_cache']
/** Las que SÍ tienen una policy de lectura deliberada para `authenticated`. Si el arreglo las
 *  apagara, sería un revoke de más — y este test lo diría. */
const LEGITIMAS = ['tasks', 'events']

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('las fotos del Sheet y el tráfico del chat no los lee authenticated', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const dir = hayBase ? (await q(`select id from perfiles where rol='direccion' limit 1`))[0] : null

  /** Asume el rol tal como lo hace PostgREST y devuelve qué pasó: cuántas filas vio, o el error. */
  async function comoAuthenticated(sql) {
    await c.query('savepoint s')
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: dir.id, role: 'authenticated' })])
    await c.query('set local role authenticated')
    let r
    try { r = { filas: (await c.query(sql)).rows[0].n } } catch (e) { r = { error: `SQLSTATE ${e.code} · ${e.message}` } }
    await c.query('rollback to savepoint s').catch(() => {})
    await c.query('reset role').catch(() => {})
    return r
  }

  try {
    await c.query('begin')

    await t.test('ninguna de las cinco le devuelve una sola fila a authenticated', { skip: !dir && 'sin perfil de dirección' }, async () => {
      const abiertas = []
      for (const tabla of SENSIBLES) {
        const r = await comoAuthenticated(`select count(*)::int n from orq.${tabla}`)
        if (r.error) continue                        // permission denied: protegida por el GRANT
        if (Number(r.filas) === 0) continue          // cero filas: protegida por la RLS
        abiertas.push(`orq.${tabla} → ${r.filas} filas`)
      }
      assert.deepEqual(abiertas, [], `authenticated leyó datos sensibles: ${abiertas.join(' · ')}`)
    })

    await t.test('y sigue leyendo las de orq que sí tiene permitidas: la corrección no fue de más', { skip: !dir && 'sin perfil de dirección' }, async () => {
      for (const tabla of LEGITIMAS) {
        const r = await comoAuthenticated(`select count(*)::int n from orq.${tabla}`)
        assert.ok(!r.error, `orq.${tabla} dejó de leerse y tenía una policy de lectura deliberada: ${r.error}`)
      }
    })

    await t.test('el worker las sigue leyendo: sheet_snapshots no quedó inaccesible', async () => {
      // El worker se conecta con DATABASE_URL, que es el rol `postgres` (dueño del esquema).
      const [{ n }] = await q(`select count(*)::int n from orq.sheet_snapshots`)
      assert.ok(n > 0, `orq.sheet_snapshots devolvió ${n} filas al rol del worker: se rompió la marcha atrás del Sheet`)
    })

    await t.test('las cinco quedaron con el mismo portero que sus vecinas de orq', async () => {
      const filas = await q(
        `select c.relname, c.relrowsecurity as rls,
                (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'orq' and c.relname = any($1)`, [SENSIBLES])
      const sinPortero = filas.filter((f) => !f.rls).map((f) => f.relname)
      assert.deepEqual(sinPortero, [], `siguen sin RLS: ${sinPortero.join(', ')}`)
    })

    await t.test('una tabla nueva de orq no nace legible por authenticated', async () => {
      const [d] = await q(
        `select d.defaclacl::text as acl from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
          where pg_get_userbyid(d.defaclrole) = 'postgres' and n.nspname = 'orq' and d.defaclobjtype = 'r'`)
      if (d) {
        assert.ok(!/authenticated=[^/]*r/.test(d.acl),
          `el default privilege de orq sigue regalando select a authenticated: ${d.acl}`)
      }
    })
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
