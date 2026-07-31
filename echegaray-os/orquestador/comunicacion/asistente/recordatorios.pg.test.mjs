// Los recordatorios contra un Postgres DE VERDAD.
//
// Por qué existe además de los tests con dobles: las tres propiedades que sostienen este
// módulo —el claim con lease, el `unique` por ocurrencia y la transacción de reprogramar—
// NO son propiedades del código, son propiedades de la base. Un doble en memoria las puede
// simular perfecto y aun así el SQL estar mal escrito: `for update skip locked` mal puesto
// deja que dos workers se lleven el mismo recordatorio, y eso en producción se ve como una
// persona recibiendo el mismo aviso dos veces, nunca como un test en rojo.
//
// Se saltea si no hay PG_TEST_URL (misma convención que conector.pr4.test.mjs). Para correrlo:
//   docker run -d --rm --name pg-rec -e POSTGRES_PASSWORD=x -e POSTGRES_DB=t postgres:16-alpine
//   PG_TEST_URL=postgres://postgres:x@<ip>:5432/t node --test orquestador/comunicacion/asistente/recordatorios.pg.test.mjs
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RecordatoriosPostgres, LEASE_SEGUNDOS_DEFAULT } from './recordatorios.mjs'
import { ESTADO_RECORDATORIO } from './contratos.mjs'

const salta = !process.env.PG_TEST_URL
const opts = { skip: salta ? 'PG_TEST_URL no seteada' : false }

const AQUI = dirname(fileURLToPath(import.meta.url))
const MIGRACION = join(AQUI, '..', '..', '..', 'supabase', 'migrations', '20260731140000_asistente_conversacional.sql')

let pool = null
let port = null

before(async () => {
  if (salta) return
  const { default: pg } = await import('pg')
  pool = new pg.Pool({ connectionString: process.env.PG_TEST_URL, max: 4 })
  port = {
    query: (t, p) => pool.query(t, p),
    withTx: async (fn) => {
      const c = await pool.connect()
      try {
        await c.query('begin')
        const r = await fn(c)
        await c.query('commit')
        return r
      } catch (e) { await c.query('rollback'); throw e } finally { c.release() }
    },
  }
  await pool.query('create schema if not exists comunicacion')
  await pool.query(readFileSync(MIGRACION, 'utf8'))
  await pool.query('truncate comunicacion.recordatorios cascade')
})

after(async () => { if (pool) await pool.end() })

const repo = () => new RecordatoriosPostgres(port)
const enElPasado = () => new Date(Date.now() - 60_000).toISOString()

const nuevo = (extra = {}) => repo().crear({
  creador: { userId: 'u-jorge', display: 'Jorge' },
  destinatario: { userId: 'u-jorge', display: 'Jorge' },
  contenido: 'cargar saldos',
  cuando: enElPasado(),
  ...extra,
})

test('la clave de idempotencia es la base y no el proceso', opts, async () => {
  const key = `msg-${Date.now()}`
  const a = await nuevo({ idempotencyKey: key })
  const b = await nuevo({ idempotencyKey: key, contenido: 'otra cosa' })
  assert.equal(b.duplicado, true)
  assert.equal(b.id ?? b.recordatorio?.id, a.id ?? a.recordatorio?.id)
  const { rows } = await pool.query('select count(*)::int n from comunicacion.recordatorios where idempotency_key = $1', [key])
  assert.equal(rows[0].n, 1, 'quedaron dos filas para el mismo mensaje')
})

test('dos workers compiten por el mismo recordatorio y se lo lleva UNO', opts, async () => {
  await pool.query('truncate comunicacion.recordatorios cascade')
  await nuevo()
  const [a, b] = await Promise.all([
    repo().reclamarVencidos({ worker: 'w-1', limite: 10 }),
    repo().reclamarVencidos({ worker: 'w-2', limite: 10 }),
  ])
  assert.equal(a.length + b.length, 1, `se lo llevaron los dos (${a.length} + ${b.length})`)
})

test('un recordatorio reclamado no lo vuelve a tomar nadie hasta que vence el lease', opts, async () => {
  await pool.query('truncate comunicacion.recordatorios cascade')
  await nuevo()
  const primero = await repo().reclamarVencidos({ worker: 'w-1' })
  assert.equal(primero.length, 1)
  assert.equal((await repo().reclamarVencidos({ worker: 'w-2' })).length, 0)
  // Vencido el lease, otro worker SÍ puede retomarlo: es lo que hace que un worker que se
  // murió con el recordatorio en la mano no lo deje colgado para siempre.
  await pool.query('update comunicacion.recordatorios set lease_hasta = now() - interval \'1 minute\'')
  assert.equal((await repo().reclamarVencidos({ worker: 'w-2' })).length, 1)
  assert.ok(LEASE_SEGUNDOS_DEFAULT > 0)
})

test('la misma ocurrencia no se puede entregar dos veces (lo impide la base)', opts, async () => {
  await pool.query('truncate comunicacion.recordatorios cascade')
  const r = await nuevo()
  const rec = r.recordatorio ?? r
  const momento = rec.proxima_ejecucion ?? rec.proximaEjecucion
  await repo().registrarEntrega(rec, { programadaPara: momento, estado: 'entregada', canalId: 'c1', postId: 'p1' })
  const segunda = await repo().registrarEntrega(rec, { programadaPara: momento, estado: 'entregada', canalId: 'c1', postId: 'p2' })
  assert.equal(segunda.duplicado, true, 'la segunda entrega de la misma ocurrencia no fue rechazada')
  const { rows } = await pool.query('select count(*)::int n from comunicacion.recordatorio_entregas where recordatorio_id = $1', [rec.id])
  assert.equal(rows[0].n, 1)
})

test('un recurrente avanza a la ocurrencia siguiente y sigue activo', opts, async () => {
  await pool.query('truncate comunicacion.recordatorios cascade')
  const r = await nuevo({ cadencia: 'weekly:lun:08:00' })
  const rec = r.recordatorio ?? r
  const antes = new Date(rec.proxima_ejecucion ?? rec.proximaEjecucion).getTime()
  await repo().reprogramar(rec)
  const { rows } = await pool.query('select estado, proxima_ejecucion, lease_hasta from comunicacion.recordatorios where id = $1', [rec.id])
  assert.equal(rows[0].estado, ESTADO_RECORDATORIO.ACTIVO)
  assert.ok(new Date(rows[0].proxima_ejecucion).getTime() > antes, 'no avanzó la ocurrencia')
  assert.equal(rows[0].lease_hasta, null, 'quedó con el lease tomado: nadie lo va a poder reclamar')
})

test('un único, entregado, se cierra y deja de aparecer entre los vencidos', opts, async () => {
  await pool.query('truncate comunicacion.recordatorios cascade')
  const r = await nuevo()
  await repo().reprogramar(r.recordatorio ?? r)
  const { rows } = await pool.query('select estado from comunicacion.recordatorios')
  assert.equal(rows[0].estado, ESTADO_RECORDATORIO.ENTREGADO)
  assert.equal((await repo().reclamarVencidos({ worker: 'w-1' })).length, 0)
})
