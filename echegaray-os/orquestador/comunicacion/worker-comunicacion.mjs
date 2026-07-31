#!/usr/bin/env node
// PR-4 · Worker del enlace Communication Service ↔ Work Fabric.
//
// Proceso de larga duración, apto para systemd (no activa producción todavía).
// Cada tick, en orden: recupera leases vencidos → vence formularios de asistencia
// abandonados (con su propio intervalo) → procesa inbox (bridge → orq) →
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
import { SesionesPostgres, crearVencedorPeriodico, VENCER_INTERVALO_MS_DEFAULT } from './asistencia-sesion.mjs'
import { crearEntregador, ENTREGA_INTERVALO_MS_DEFAULT } from './asistente/entrega-recordatorios.mjs'
import { query, withTx } from '../lib/db.mjs'

const IDLE_MS = Number(process.env.COMM_WORKER_IDLE_MS ?? 2000)
const BUSY_MS = Number(process.env.COMM_WORKER_BUSY_MS ?? 200)
const MAX_IDLE_MS = 15_000
// Cada cuánto se barren los formularios de asistencia vencidos. Ver crearVencedorPeriodico.
const VENCER_MS = Number(process.env.COMM_WORKER_VENCER_MS ?? VENCER_INTERVALO_MS_DEFAULT)
// Cada cuánto se buscan recordatorios internos vencidos. Ver crearEntregador.
const RECORDATORIOS_MS = Number(process.env.COMM_WORKER_RECORDATORIOS_MS ?? ENTREGA_INTERVALO_MS_DEFAULT)

const log = crearLog()
let parar = false
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function tick(con, vencerSesiones, entregarRecordatorios) {
  await con.recuperarLeasesWorkFabric()
  await con.recuperarLeasesComm()
  // Barrido de formularios de asistencia abandonados. Tiene su PROPIO intervalo (este loop
  // puede girar cada 200 ms) y no suma a `trabajo`: no debe mantener el loop en modo busy.
  // Se loguea solo cuando cierra algo, y nunca propaga error (ver crearVencedorPeriodico).
  await vencerSesiones()
  // Entrega de recordatorios internos. Mismo criterio que el barrido de arriba: intervalo
  // propio, no suma a `trabajo` y no propaga error (un recordatorio roto no voltea el canal).
  await entregarRecordatorios()
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
  // El vencimiento de sesiones de asistencia corre ACÁ y no en un scheduler aparte: este
  // worker ya es el proceso de larga duración del canal y ya tiene el pool de la base.
  const vencerSesiones = crearVencedorPeriodico({
    sesiones: new SesionesPostgres({ query, withTx }), intervaloMs: VENCER_MS, log,
  })
  // Los recordatorios se entregan por DM desde ACÁ por la misma razón: es el único proceso
  // que tiene a la vez el pool de la base y el cliente de Mattermost.
  const entregarRecordatorios = crearEntregador({
    port: { query, withTx },
    abrirDM: (userId) => con.canalPrivadoPara(userId),
    publicar: ({ channelId, texto }) => con.cliente.crearPost({ channel_id: channelId, message: texto }),
    intervaloMs: RECORDATORIOS_MS, log,
  })
  log.info('worker-comunicacion arrancado', { vencer_sesiones_ms: VENCER_MS, recordatorios_ms: RECORDATORIOS_MS })
  for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { log.info('shutdown pedido', { señal: s }); parar = true })

  let espera = IDLE_MS
  while (!parar) {
    let r
    try {
      r = await tick(con, vencerSesiones, entregarRecordatorios)
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
