// Capa de acceso a Postgres del Work Fabric. Driver `pg` (portable — D2), no el
// cliente REST de Supabase: la cola necesita transacciones reales y
// FOR UPDATE SKIP LOCKED a nivel de sesión, que PostgREST no ofrece.
//
// Este es el ÚNICO módulo que conoce el driver. El resto del Fabric usa el port
// (query / withTx). Cambiar de Postgres gestionado a otro no toca nada más.
import pg from 'pg'
import { loadConfig } from './config.mjs'

let pool = null

/** Pool singleton. SSL por defecto (Supabase pooler lo exige); sin verificación
 *  de CA porque el pooler usa cert propio — la conexión sigue cifrada. */
export function getPool() {
  if (pool) return pool
  const cfg = loadConfig()
  pool = new pg.Pool({
    connectionString: cfg.DATABASE_URL,
    ssl: cfg.DB_SSL ? { rejectUnauthorized: false } : false,
    max: Math.max(2, cfg.CONCURRENCY + 1),
    application_name: `orq-worker:${cfg.WORKER_ID}`,
    idle_in_transaction_session_timeout: 60_000,
  })
  return pool
}

/** Query simple fuera de transacción. */
export async function query(text, params) {
  return getPool().query(text, params)
}

/** Ejecuta fn dentro de una transacción; commit al terminar, rollback si lanza.
 *  Es la base del Transactional Outbox (D1): cambio de estado + emit_event en la
 *  misma transacción. */
export async function withTx(fn) {
  const client = await getPool().connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (err) {
    try {
      await client.query('rollback')
    } catch {
      /* la conexión pudo haberse caído; el pool la descarta */
    }
    throw err
  } finally {
    client.release()
  }
}

/** Chequeo de conectividad + versión de Postgres (health check). */
export async function ping() {
  const { rows } = await query('select current_database() as db, version() as version, now() as now')
  return rows[0]
}

export async function closePool() {
  if (pool) {
    await pool.end()
    pool = null
  }
}
