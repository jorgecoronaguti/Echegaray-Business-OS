// Capa de acceso a Postgres del Work Fabric. Driver `pg` (portable — D2), no el
// cliente REST de Supabase: la cola necesita transacciones reales y
// FOR UPDATE SKIP LOCKED a nivel de sesión, que PostgREST no ofrece.
//
// Este es el ÚNICO módulo que conoce el driver. El resto del Fabric usa el port
// (query / withTx). Cambiar de Postgres gestionado a otro no toca nada más.
import pg from 'pg'
import { loadConfig } from './config.mjs'
import { baseDeclaradaDePrueba, enContextoDePrueba, instalarGuarda } from './guarda-base-de-prueba.mjs'

let pool = null

/** Parsea una connection string de Postgres en campos discretos, de forma
 *  tolerante a passwords crudos (con `#`, `!`, `/`, `?`… sin percent-encode) que
 *  romperían al parser WHATWG/pg si se pasaran como `connectionString`. La clave:
 *  el host nunca contiene `@`, así que el ÚLTIMO `@` separa userinfo de host, y el
 *  password puede contener cualquier cosa entre el primer `:` del userinfo y ese
 *  `@`. Devuelve null si no reconoce el formato (fallback a connectionString). */
export function parseConnectionString(raw) {
  if (!raw) return null
  const m = /^(postgres(?:ql)?):\/\/(.*)$/s.exec(raw.trim())
  if (!m) return null
  const rest = m[2]
  const at = rest.lastIndexOf('@')
  if (at < 0) return null
  const userinfo = rest.slice(0, at)
  let hostpart = rest.slice(at + 1)
  const colon = userinfo.indexOf(':')
  const user = decodeURIComponent(colon < 0 ? userinfo : userinfo.slice(0, colon))
  // password crudo: NO se decodifica (el archivo lo trae literal, sin encoding)
  const password = colon < 0 ? undefined : userinfo.slice(colon + 1)
  // hostpart: host[:port][/dbname][?query]
  let query = ''
  const q = hostpart.indexOf('?')
  if (q >= 0) { query = hostpart.slice(q + 1); hostpart = hostpart.slice(0, q) }
  let database
  const slash = hostpart.indexOf('/')
  if (slash >= 0) { database = decodeURIComponent(hostpart.slice(slash + 1)); hostpart = hostpart.slice(0, slash) }
  let host = hostpart
  let port
  const hc = hostpart.lastIndexOf(':')
  if (hc >= 0 && /^\d+$/.test(hostpart.slice(hc + 1))) { host = hostpart.slice(0, hc); port = Number(hostpart.slice(hc + 1)) }
  const params = new URLSearchParams(query)
  return { host, port, user, password, database, sslmode: params.get('sslmode') || undefined }
}

/** Pool singleton. SSL por defecto (Supabase pooler lo exige); sin verificación
 *  de CA porque el pooler usa cert propio — la conexión sigue cifrada.
 *
 *  Y si quien lo pide es un test contra la base PRODUCTIVA, el pool sale vigilado: escribir en
 *  autocommit falla y un commit que escribió se convierte en rollback. El detalle y las tres
 *  salidas legítimas, en `guarda-base-de-prueba.mjs`. Fuera de un test devuelve el pool pelado —
 *  la guarda no se instala en producción. */
export function getPool() {
  if (pool) return pool
  const cfg = loadConfig()
  const ssl = cfg.DB_SSL ? { rejectUnauthorized: false } : false
  const parsed = parseConnectionString(cfg.DATABASE_URL)
  const base = parsed
    ? { host: parsed.host, port: parsed.port, user: parsed.user, password: parsed.password, database: parsed.database }
    : { connectionString: cfg.DATABASE_URL }
  pool = new pg.Pool({
    ...base,
    ssl,
    max: Math.max(2, cfg.CONCURRENCY + 1),
    application_name: `orq-worker:${cfg.WORKER_ID}`,
    idle_in_transaction_session_timeout: 60_000,
  })
  return instalarGuarda(pool, {
    esPrueba: enContextoDePrueba(),
    baseDePrueba: baseDeclaradaDePrueba(cfg.DATABASE_URL),
  })
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
