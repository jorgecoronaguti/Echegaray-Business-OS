#!/usr/bin/env node
// Worker durable del Work Fabric (Fase 1). Independiente de Next.js y de toda
// sesión interactiva. Corre como servicio systemd en la VM (Fase 6).
//
// Modos:
//   node orquestador/worker.mjs            -> daemon (loop hasta SIGTERM/SIGINT)
//   node orquestador/worker.mjs --once     -> procesa lo disponible y termina
//   node orquestador/worker.mjs --health   -> imprime salud y termina (0/1)
//
// Ciclo por tarea: claim -> running -> (handler) -> reviewing -> succeeded,
// con heartbeat de lease; ante error, fail_task (reintento/backoff/dead-letter).
import { loadConfig } from './lib/config.mjs'
import { createLogger } from './lib/logger.mjs'
import { ping, closePool } from './lib/db.mjs'
import { esperarDb } from './lib/db-espera.mjs'
import { resolveContext } from './lib/identity.mjs'
import {
  claimTask, heartbeat, transition, failTask, parkTask, reapExpiredLeases, queueSnapshot,
  intentoPrevioInterrumpido,
} from './lib/ledger.mjs'
import { crearCicloTarea } from './lib/ciclo-tarea.mjs'
import { resolveHandler } from './handlers/index.mjs'
import { capturePostMortem } from './lib/learning.mjs'
import { cerebroDisponible } from './lib/estado-cerebro.mjs'

const cfg = loadConfig()
const log = createLogger({ component: 'worker', worker_id: cfg.WORKER_ID })
const MODE = process.argv.includes('--health') ? 'health' : process.argv.includes('--once') ? 'once' : 'daemon'

// Tareas que NECESITAN el razonador (Anthropic). Si el crédito se agota, se PARKEAN (no se matan):
// se reanudan solas cuando vuelve el crédito. El resto (operation_execute, scheduled_directive,
// noop…) no toca la API y corre siempre.
const TIPOS_IA = new Set(['specialist', 'direction', 'direction_consolidate', 'plan', 'code_change'])

let accepting = true
const inFlight = new Map() // taskId -> promise

async function processTask(task) {
  const tlog = log.child({ task_id: task.id, correlation_id: task.correlation_id, type: task.type })
  const ctx = { logger: tlog, config: cfg, context: await resolveContext() }
  // El ciclo (latido, guardas y transiciones) es el MISMO que usa el worker de comunicación:
  // lib/ciclo-tarea.mjs. Duplicarlo acá fue lo que dejó al de comunicación sin latido.
  const ejecutarCiclo = crearCicloTarea({
    ledger: { transition, heartbeat, failTask, intentoPrevioInterrumpido },
    workerId: cfg.WORKER_ID, leaseSeconds: cfg.LEASE_SECONDS, heartbeatMs: cfg.HEARTBEAT_MS,
    backoffMs: cfg.BACKOFF_BASE_MS, log: tlog,
  })
  const r = await ejecutarCiclo(task, {
    // RAZONADOR SIN CRÉDITO: si esta tarea necesita la IA y el flag dice que no hay crédito, la
    // PARKEAMOS antes de gastar un intento. Se reanuda sola cuando vuelve el crédito (no dead_letter).
    antesDeCorrer: async () => {
      if (!TIPOS_IA.has(task.type) || (await cerebroDisponible()).disponible) return null
      await parkTask(task.id, cfg.WORKER_ID, 'razonador sin crédito')
      tlog.warn('tarea IA parkeada: razonador sin crédito; se reintentará cuando vuelva')
      return { omitir: true, motivo: 'razonador sin crédito' }
    },
    correr: async (t) => {
      const handler = resolveHandler(t.type)
      if (!handler) throw new Error(`sin handler para type='${t.type}'`)
      return runWithTimeout(handler(t, ctx), cfg.ENGINE_TIMEOUT_MS)
    },
    alFallar: (t, err) => parkearSiEsFaltaDeCredito(t, err, tlog),
    // Aprendizaje (Fase 4): sin más reintentos -> post-mortem con causa + recomendación.
    alTerminarEnFallo: async (t, { motivo }) => {
      try { await capturePostMortem(t, ctx, motivo) } catch (e) { tlog.warn('post-mortem falló', { error: e.message }) }
    },
  })
  if (r.resultado === 'ok') tlog.info('tarea completada')
}

/** Si el fallo fue porque el razonador se quedó SIN CRÉDITO a mitad de camino, no la matamos:
 *  la parkeamos para reintentar sola cuando vuelva. err.kind lo propaga el engine anthropic-api. */
async function parkearSiEsFaltaDeCredito(task, err, tlog) {
  const sinCredito = err.kind === 'credit' || err.kind === 'auth' || /sin\s+cr[eé]dito/i.test(err.message || '')
  if (!sinCredito || !TIPOS_IA.has(task.type)) return { manejado: false }
  try {
    await parkTask(task.id, cfg.WORKER_ID, `razonador sin crédito: ${err.message}`.slice(0, 400))
    tlog.warn('tarea IA parkeada tras fallo de crédito; se reintentará cuando vuelva')
    return { manejado: true }
  } catch (e) {
    tlog.warn('no se pudo parkear; sigue el flujo de fallo normal', { error: e.message })
    return { manejado: false }
  }
}

function runWithTimeout(promise, ms) {
  let t
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`timeout tras ${ms}ms`)), ms) })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t))
}

async function tick() {
  while (accepting && inFlight.size < cfg.CONCURRENCY) {
    const task = await claimTask(cfg.WORKER_ID, cfg.LEASE_SECONDS)
    if (!task) return false // no hay trabajo ahora
    log.info('tarea reclamada', { task_id: task.id, title: task.title, attempt: task.attempt })
    const p = processTask(task).finally(() => inFlight.delete(task.id))
    inFlight.set(task.id, p)
  }
  return true
}

async function runOnce() {
  await reapExpiredLeases()
  for (;;) {
    const slotsFull = await tick()
    if (!slotsFull && inFlight.size === 0) break // nada que reclamar ni en vuelo
    if (inFlight.size > 0) await Promise.race([...inFlight.values()]) // liberar un slot
  }
  await Promise.allSettled([...inFlight.values()])
}

async function runDaemon() {
  // EL LOG DICE EL MOTOR QUE DE VERDAD DECIDE. `cfg.ENGINE` (`ORQ_ENGINE`) no lo usa NADIE para
  // elegir: los cuatro handlers resuelven con `AI_ENGINE_DEFAULT`, y `code_change` fija `claude-cli`
  // por su cuenta porque es el Builder. Durante meses `ORQ_ENGINE=claude-cli` estuvo en `worker.env`
  // y esta línea publicaba «engine: claude-cli», que hacía creer que el negocio del OS corría por
  // Claude Code y se caía con su cuota. No era cierto — y ahora el log tampoco lo dice.
  log.info('daemon iniciado', {
    concurrency: cfg.CONCURRENCY,
    razonador: cfg.AI_ENGINE_DEFAULT,
    constructor: 'claude-cli (sólo code_change)',
    engine_legado: cfg.ENGINE ?? null,
  })
  let ticks = 0
  while (accepting) {
    if (ticks % 20 === 0) await reapExpiredLeases() // reconciliación periódica
    const slotsFull = await tick()
    ticks++
    if (slotsFull) await Promise.race([...inFlight.values()]) // esperar un slot libre
    else await sleep(cfg.POLL_INTERVAL_MS) // no había trabajo: back-off de polling
  }
  log.info('drenando tareas en vuelo', { in_flight: inFlight.size })
  await Promise.allSettled([...inFlight.values()])
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function health() {
  try {
    const db = await ping()
    const snap = await queueSnapshot()
    log.info('HEALTH OK', { db: db.db, queue: Object.fromEntries(snap.map((r) => [r.state, r.n])) })
    process.exitCode = 0
  } catch (e) {
    log.error('HEALTH FAIL', { error: e.message })
    process.exitCode = 1
  } finally { await closePool() }
}

function installSignals() {
  const shutdown = async (sig) => {
    if (!accepting) return
    log.info('shutdown solicitado', { signal: sig })
    accepting = false
    await Promise.allSettled([...inFlight.values()])
    await closePool()
    log.info('shutdown completo')
    process.exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

/** Reconciliación al arranque (Fase 4): recupera trabajo que quedó "en vuelo" con
 *  lease vencido por un worker anterior caído. Idempotente y seguro. */
async function reconcileOnStartup() {
  const recovered = await reapExpiredLeases()
  if (recovered.length) log.info('reconciliación de arranque: trabajo recuperado', { recovered: recovered.length })
}

async function main() {
  if (MODE === 'health') return health()
  // Espera resiliente a la DB: un blip transitorio de Supabase (econnrefused) no debe
  // crashear el worker en cadena — espera con backoff y aborta solo ante caída real.
  await esperarDb({ ping, onRetry: (i) => log.warn('DB no disponible, esperando (blip de Supabase)', i) })
  await resolveContext() // valida ejes/DB antes de tomar trabajo
  await reconcileOnStartup()
  installSignals()
  if (MODE === 'once') { await runOnce(); await closePool(); log.info('--once completo') }
  else await runDaemon()
}

main().catch((err) => { log.error('worker abortó', { error: err.message }); process.exitCode = 1 })
