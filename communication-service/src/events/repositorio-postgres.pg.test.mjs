// PR-3 · Tests de INTEGRACIÓN reales del RepositorioPostgres (M11).
//
// Corren contra un Postgres EFÍMERO y DESCARTABLE (ver scripts/test-postgres.mjs,
// `npm run test:pg`). NO son mocks del pool: ejercitan SQL real. Si no hay
// PG_TEST_URL, todo se saltea (así `npm test` sigue hermético y verde).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { RepositorioPostgres } from './repositorio-postgres.mjs'
import { RepositorioMemoria } from './repositorio-memoria.mjs'
import { decidirProximo, ESTADO } from '../core/outbox.mjs'
import { construirEvento, TIPOS } from '../core/eventos-canonicos.mjs'

const URL = process.env.PG_TEST_URL
const salta = !URL // sin base ⇒ se saltean (no fallan)
const opts = { skip: salta ? 'PG_TEST_URL no seteada (usar npm run test:pg)' : false }

let pool
if (URL) pool = new pg.Pool({ connectionString: URL, max: 6 })

/** Port { query, withTx } sobre el pool efímero — lo mismo que el OS inyectará. */
function crearPort() {
  return {
    query: (t, p) => pool.query(t, p),
    withTx: async (fn) => {
      const c = await pool.connect()
      try {
        await c.query('begin')
        const r = await fn({ query: (t, p) => c.query(t, p) })
        await c.query('commit')
        return r
      } catch (e) { await c.query('rollback'); throw e } finally { c.release() }
    },
  }
}

function repo() { return new RepositorioPostgres(crearPort()) }
const salienteEv = (over = {}) => construirEvento({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: 'c1', texto: 't' }, ...over })
const entranteEv = (over = {}) => construirEvento({ type: TIPOS.MENSAJE_RECIBIDO, idempotency_key: 'p1', data: { channel_id: 'c1', post_id: 'p1', texto: 't' }, ...over })

beforeEach(async () => {
  if (salta) return
  await pool.query('truncate comunicacion.eventos, comunicacion.outbox, comunicacion.inbox, comunicacion.dead_letter, comunicacion.rechazos_entrantes restart identity')
})

test('la migración creó el schema y las tablas', opts, async () => {
  const { rows } = await pool.query(
    `select table_name from information_schema.tables where table_schema='comunicacion' order by 1`)
  const nombres = rows.map((r) => r.table_name)
  for (const t of ['eventos', 'outbox', 'inbox', 'dead_letter', 'rechazos_entrantes', 'identidades']) {
    assert.ok(nombres.includes(t), `falta tabla ${t}`)
  }
})

test('registrarEvento: insert atómico devuelve insertado real (true, luego false por UNIQUE)', opts, async () => {
  const r = repo()
  const ev = salienteEv({ idempotency_key: 'k-uno' })
  assert.equal((await r.registrarEvento(ev)).insertado, true)
  assert.equal((await r.registrarEvento(ev)).insertado, false, 'ON CONFLICT DO NOTHING RETURNING ⇒ no reinsertó')
})

test('el log de eventos es append-only (trigger prohíbe update/delete)', opts, async () => {
  const r = repo()
  await r.registrarEvento(salienteEv({ idempotency_key: 'k-ap' }))
  await assert.rejects(pool.query(`update comunicacion.eventos set type='x'`), /append-only/)
  await assert.rejects(pool.query(`delete from comunicacion.eventos`), /append-only/)
})

test('outbox: claim con lease es exclusivo entre dos workers concurrentes', opts, async () => {
  const r = repo()
  const ev = salienteEv({ idempotency_key: 'k-claim' })
  await r.registrarEvento(ev); await r.salida.encolar(ev)
  // dos workers reclaman EN PARALELO (conexiones distintas del pool):
  const [a, b] = await Promise.all([
    r.salida.reclamar('worker-A', 10, 30_000),
    r.salida.reclamar('worker-B', 10, 30_000),
  ])
  assert.equal(a.length + b.length, 1, 'exactamente un worker se quedó con el ítem')
})

test('outbox: reintento — resolver a pendiente con backoff no es reclamable hasta vencer', opts, async () => {
  const r = repo()
  const ev = salienteEv({ idempotency_key: 'k-retry' })
  await r.registrarEvento(ev); await r.salida.encolar(ev)
  const [item] = await r.salida.reclamar('w', 10, 30_000)
  const next = decidirProximo(item, { ok: false, error: '503', reintentable: true })
  await r.salida.resolver(item.id, next)
  assert.equal((await r.salida.reclamar('w', 10, 30_000)).length, 0, 'con next_attempt_at futuro no se reclama')
  await pool.query(`update comunicacion.outbox set next_attempt_at = now() - interval '1 second'`)
  assert.equal((await r.salida.reclamar('w', 10, 30_000)).length, 1, 'ya vencido, reclamable de nuevo')
})

test('outbox: DLQ — error permanente termina en dead_letter con correlation/causation', opts, async () => {
  const r = repo()
  const raiz = entranteEv()
  const ev = salienteEv({ idempotency_key: 'k-dlq', correlation_id: raiz.correlation_id, causation_id: raiz.id })
  await r.registrarEvento(ev); await r.salida.encolar(ev)
  const [item] = await r.salida.reclamar('w', 10, 30_000)
  const next = decidirProximo(item, { ok: false, error: '400 bad', reintentable: false })
  await r.salida.resolver(item.id, next)
  if (next.a_dlq) await r.salida.aDeadLetter({ ...item, last_error: next.last_error })
  const { rows } = await pool.query('select * from comunicacion.dead_letter')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].cola, 'salida')
  assert.equal(rows[0].correlation_id, ev.correlation_id)
  assert.equal(rows[0].causation_id, ev.causation_id)
})

test('lease vencido: recuperarLeases devuelve el ítem a pendiente', opts, async () => {
  const r = repo()
  const ev = salienteEv({ idempotency_key: 'k-lease' })
  await r.registrarEvento(ev); await r.salida.encolar(ev)
  // reclamar con lease negativo = worker que ya murió (lease_expires_at en el pasado)
  await r.salida.reclamar('worker-muerto', 10, -1000)
  assert.equal((await r.salida.reclamar('w2', 10, 30_000)).length, 0, 'sigue en_proceso hasta recuperar')
  assert.equal(await r.salida.recuperarLeases(), 1)
  assert.equal((await r.salida.reclamar('w2', 10, 30_000)).length, 1, 'recuperado ⇒ reclamable')
})

test('inbox: replay — reencolar un muerto lo vuelve pendiente (idempotencia de replay)', opts, async () => {
  const r = repo()
  const ev = entranteEv({ idempotency_key: 'in-replay' })
  await r.registrarEvento(ev); await r.entrada.encolar(ev)
  const [item] = await r.entrada.reclamar('w', 10, 30_000)
  await r.entrada.resolver(item.id, { estado: ESTADO.DEAD, intentos: 6, next_attempt_at: null, last_error: 'x', a_dlq: true })
  assert.equal(await r.entrada.reencolar(ev.id), true, 'por evento_id')
  const { rows } = await pool.query(`select estado from comunicacion.inbox where evento_id=$1`, [ev.id])
  assert.equal(rows[0].estado, 'pendiente')
})

test('encolar es idempotente (UNIQUE idempotency_key): dos encolar ⇒ una fila', opts, async () => {
  const r = repo()
  const ev = salienteEv({ idempotency_key: 'k-idem' })
  await r.registrarEvento(ev)
  await r.salida.encolar(ev); await r.salida.encolar(ev)
  const { rows } = await pool.query('select count(*)::int n from comunicacion.outbox')
  assert.equal(rows[0].n, 1)
})

test('rollback transaccional: si la tx falla, no persiste nada', opts, async () => {
  const port = crearPort()
  await assert.rejects(port.withTx(async (tx) => {
    await tx.query(`insert into comunicacion.eventos (id, schema_version, type, direccion, idempotency_key, occurred_at)
      values (gen_random_uuid(), 1, 'mensaje.publicar', 'outbound', 'k-rollback', now())`)
    throw new Error('boom')
  }))
  const { rows } = await pool.query(`select count(*)::int n from comunicacion.eventos where idempotency_key='k-rollback'`)
  assert.equal(rows[0].n, 0, 'el insert se revirtió con la tx')
})

test('consistencia Postgres ↔ Memoria: mismas señales observables', opts, async () => {
  for (const r of [repo(), new RepositorioMemoria()]) {
    const ev = salienteEv({ idempotency_key: `cons-${r.constructor.name}` })
    assert.equal((await r.registrarEvento(ev)).insertado, true)
    assert.equal((await r.registrarEvento(ev)).insertado, false)
    await r.salida.encolar(ev)
    const [item] = await r.salida.reclamar('w', 10, 30_000)
    assert.ok(item && item.evento.id === ev.id, `${r.constructor.name}: reclamó el ítem con el evento canónico`)
  }
})

test.after(async () => { if (pool) await pool.end() })
