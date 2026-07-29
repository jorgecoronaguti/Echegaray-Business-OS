#!/usr/bin/env node
// PR-4 · Worker del enlace Communication Service ↔ Work Fabric.
//
// Proceso de larga duración, apto para systemd (no activa producción todavía).
// Cada tick, en orden: recupera leases vencidos → procesa inbox (bridge → orq) →
// procesa el Work Fabric (claim oficial + handler + respuesta) → procesa outbox
// (publica en Mattermost). Idempotente y tolerante a reinicios: todo el estado
// vive en la base (colas con lease + orq.tasks); un reinicio reanuda sin perder
// nada. Sin loop agresivo: duerme entre ticks y hace backoff si está ocioso.
// Shutdown limpio ante SIGTERM/SIGINT.
//
// Uso (staging / entorno de prueba, NO producción sin autorización):
//   DATABASE_URL=… MM_INCOMING_SECRET=… MM_BOT_TOKEN=… node orquestador/comunicacion/worker-comunicacion.mjs
import { crearConector } from './conector.mjs'
import { crearLog } from '../../../communication-service/src/index.mjs'

const IDLE_MS = Number(process.env.COMM_WORKER_IDLE_MS ?? 2000)
const BUSY_MS = Number(process.env.COMM_WORKER_BUSY_MS ?? 200)
const MAX_IDLE_MS = 15_000

const log = crearLog()
let parar = false
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function tick(con) {
  await con.recuperarLeasesWorkFabric()
  await con.recuperarLeasesComm()
  const inbox = await con.procesarInbox({ lote: 20 })
  const wf = await con.procesarWorkFabric({ lote: 20 })
  const outbox = await con.procesarOutbox({ lote: 20 })
  const trabajo = inbox.intentados + wf.intentados + outbox.intentados
  return { trabajo, inbox, wf, outbox }
}

async function main() {
  // FAIL-FAST: el conector exige un cliente REAL de Mattermost (MM_BOT_TOKEN) para
  // que el outbox publique de verdad; sin token no arranca (nunca FakeMattermost en
  // producción). La auth de ENTRADA la da el consumidor WS ⇒ conector sin verificador.
  let con
  try {
    con = crearConector({ log, verificador: null, botUserId: process.env.MM_BOT_USER_ID ?? null })
  } catch (e) {
    console.error('worker-comunicacion: no arranca —', String(e?.message ?? e))
    process.exit(1)
  }
  log.info('worker-comunicacion arrancado', {})
  for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { log.info('shutdown pedido', { señal: s }); parar = true })

  let espera = IDLE_MS
  while (!parar) {
    let r
    try {
      r = await tick(con)
    } catch (e) {
      log.error('tick falló (se reintenta el próximo ciclo)', { error: String(e?.message ?? e) })
      await sleep(Math.min(espera, MAX_IDLE_MS))
      espera = Math.min(espera * 2, MAX_IDLE_MS)
      continue
    }
    if (r.trabajo > 0) {
      espera = BUSY_MS // hubo trabajo: seguí pronto
      log.info('tick con trabajo', r)
    } else {
      espera = Math.min(Math.round(espera * 1.5), MAX_IDLE_MS) // ocioso: backoff suave
    }
    await sleep(espera)
  }
  log.info('worker-comunicacion detenido limpio', {})
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
