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
import { resolveContext } from './lib/identity.mjs'
import {
  claimTask, heartbeat, transition, failTask, reapExpiredLeases, queueSnapshot,
} from './lib/ledger.mjs'
import { resolveHandler } from './handlers/index.mjs'

const cfg = loadConfig()
const log = createLogger({ component: 'worker', worker_id: cfg.WORKER_ID })
const MODE = process.argv.includes('--health') ? 'health' : process.argv.includes('--once') ? 'once' : 'daemon'

let accepting = true
const inFlight = new Map() // taskId -> promise

async function processTask(task) {
  const tlog = log.child({ task_id: task.id, correlation_id: task.correlation_id, type: task.type })
  let lost = false
  const hb = setInterval(async () => {
    try {
      if (!(await heartbeat(task.id, cfg.WORKER_ID, cfg.LEASE_SECONDS))) {
        lost = true
        tlog.warn('lease perdido; abandonando tarea')
      }
    } catch (e) { tlog.warn('heartbeat error', { error: e.message }) }
  }, cfg.HEARTBEAT_MS)

  try {
    await transition(task.id, cfg.WORKER_ID, 'running')
    const handler = resolveHandler(task.type)
    if (!handler) throw new Error(`sin handler para type='${task.type}'`)

    const ctx = { logger: tlog, config: cfg, context: await resolveContext() }
    const out = await runWithTimeout(handler(task, ctx), cfg.ENGINE_TIMEOUT_MS)

    if (lost) return // el reap se encargará; no pisamos a otro worker
    await transition(task.id, cfg.WORKER_ID, 'reviewing')
    await transition(task.id, cfg.WORKER_ID, 'succeeded', {
      result: out?.result ?? {}, evidence: out?.evidence ?? {}, review: { passed: true, gate: 'noop' },
    })
    tlog.info('tarea completada')
  } catch (err) {
    if (lost) return
    const next = await failTask(task.id, cfg.WORKER_ID, err.message, cfg.BACKOFF_BASE_MS)
    tlog.error('tarea falló', { error: err.message, next_state: next })
  } finally {
    clearInterval(hb)
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
  log.info('daemon iniciado', { concurrency: cfg.CONCURRENCY, engine: cfg.ENGINE })
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

async function main() {
  if (MODE === 'health') return health()
  await resolveContext() // valida ejes/DB antes de tomar trabajo
  installSignals()
  if (MODE === 'once') { await runOnce(); await closePool(); log.info('--once completo') }
  else await runDaemon()
}

main().catch((err) => { log.error('worker abortó', { error: err.message }); process.exitCode = 1 })
