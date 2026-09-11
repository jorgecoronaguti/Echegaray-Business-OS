// Capa de acceso a Postgres del Work Fabric. Driver `pg` (portable — D2), no el
// cliente REST de Supabase: la cola necesita transacciones reales y
// FOR UPDATE SKIP LOCKED a nivel de sesión, que PostgREST no ofrece.
//
// Este es el ÚNICO módulo que conoce el driver. El resto del Fabric usa el port
// (query / withTx). Cambiar de Postgres gestionado a otro no toca nada más.
import pg from 'pg'
import { loadConfig } from './config.mjs'
import { baseDeclaradaDePrueba, enContextoDePrueba, instalarGuarda } from './guarda-base-de-prueba.mjs'
import { esConexionPerdida } from './conexion-perdida.mjs'

let pool = null

// ── LA CONEXIÓN PERDIDA — incidente 10/09/2026, 23 horas colgado ───────────────────────
//
// Supabase reinició del lado del servidor y el worker de comunicación quedó vivo pero
// detenido para siempre: `pg` NO trae timeouts por defecto (`connectionTimeoutMillis: 0`,
// `query_timeout: undefined`), así que una query sobre un socket medio abierto devuelve una
// promesa que no se cumple NI se rechaza. No hay log, no hay error, no hay dead-letter: el
// proceso se va al silencio y `systemctl` lo sigue viendo `active`. El detalle completo y la
// regla están en `conexion-perdida.mjs`.
//
// Los tres números de abajo son lo único que impide que eso vuelva a pasar a nivel driver.
// Son generosos a propósito: no están para cortar una consulta lenta —hay scripts de este
// repo que tardan minutos— sino para que NINGUNA espera sea infinita.

/** Abrir una conexión nueva a Supabase cuesta ~800 ms (arranque en frío del pooler).
 *  15 s es 18× ese costo: si no conectó, no va a conectar. Con el default (0 = infinito)
 *  `pool.connect()` se queda esperando un cliente que nunca llega. */
const CONNECT_TIMEOUT_MS = Number(process.env.ORQ_DB_CONNECT_TIMEOUT_MS ?? 15_000)
/** Techo del lado del CLIENTE (no del servidor: `statement_timeout` viaja por el socket y
 *  sobre un socket muerto no sirve de nada). 5 minutos: ninguna consulta legítima de este
 *  repo llega ahí —la más lenta medida, el libro de movimientos, son ~110 s repartidos en
 *  muchas sentencias— y a la vez acota el cuelgue a minutos en vez de a un día. */
const QUERY_TIMEOUT_MS = Number(process.env.ORQ_DB_QUERY_TIMEOUT_MS ?? 300_000)
/** TCP keepalive: que el sistema operativo note el peer muerto en vez de esperar el
 *  timeout de retransmisión (horas). */
const KEEPALIVE_MS = Number(process.env.ORQ_DB_KEEPALIVE_MS ?? 10_000)

const oyentesDeCorte = new Set()

/** Avisame cuando el POOL pierda la conexión. Es el otro agujero del incidente: `pg` emite
 *  `error` en el pool cuando se muere un cliente OCIOSO —nadie lo está esperando, así que no
 *  hay `await` donde aparezca— y un `'error'` sin listener en un EventEmitter TIRA. El
 *  proceso de larga duración se suscribe acá y sale con código ≠ 0 para que systemd lo
 *  reinicie. Devuelve la función para desuscribirse. */
export function alPerderLaConexion(cb) {
  oyentesDeCorte.add(cb)
  return () => oyentesDeCorte.delete(cb)
}

/** Cuelga el vigilante en un pool. Exportada para poder probarla con un pool FALSO que
 *  emite «terminating connection due to administrator command» sin necesidad de que Supabase
 *  se reinicie de verdad (ver `comunicacion/conexion-perdida.test.mjs`). */
export function instalarVigilanciaDeConexion(p) {
  p.on('error', (err) => {
    // Pasa igual lo que no clasifica: un error de pool nunca es inocuo, y quien escucha
    // decide. Lo que NO se hace acá es reintentar ni reconectar.
    const corte = esConexionPerdida(err)
    for (const cb of [...oyentesDeCorte]) {
      try { cb(err, { corte }) } catch { /* un oyente roto no voltea el pool */ }
    }
    // Sin oyentes (scripts de una sola corrida) el error se imprime y no mata el proceso:
    // lo que importa es que NO quede como `'error'` sin listener, que tira por su cuenta.
    if (oyentesDeCorte.size === 0) console.error('db: error del pool —', String(err?.message ?? err))
  })
  return p
}

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
    // Ninguna espera infinita. Ver el bloque del incidente, arriba.
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    keepAlive: true,
    keepAliveInitialDelayMillis: KEEPALIVE_MS,
  })
  instalarVigilanciaDeConexion(pool)
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
