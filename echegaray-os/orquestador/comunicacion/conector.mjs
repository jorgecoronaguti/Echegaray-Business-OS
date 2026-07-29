// PR-4 · Conector Communication Service ↔ Work Fabric (composition root).
//
// Es el ÚNICO lugar que conoce a los dos lados. Respeta la regla de dependencia:
// el OS (composition root) importa el Communication Service; el Communication
// Service NUNCA importa el OS. Cablea:
//   - RepositorioPostgres del comm-service sobre el MISMO pool del Work Fabric (db.mjs).
//   - MattermostAdapter (cliente real o Fake, inyectado).
//   - VerificadorEntrante (HMAC) para el borde entrante (M7).
//   - PuenteOrqEvents con `emitEvent` = ingesta oficial (orq.emit_event + orq.enqueue_task).
//   - handlers entrantes → publican al puente.
//   - responderComunicacion = salida (evento canónico saliente que preserva el hilo).
//   - procesarWorkFabric = paso REAL del Work Fabric (claim oficial + handler + transición).
//
// No abre una capa de eventos paralela ni escribe directo tablas internas del
// Work Fabric: usa orq.emit_event / orq.enqueue_task / orq.claim_task / transition.

import {
  CommunicationService, RepositorioPostgres, MattermostAdapter, FakeMattermost,
  VerificadorEntrante, PuenteOrqEvents, crearLog, crearMetricas, TIPOS,
} from '../../../communication-service/src/index.mjs'
import { query, withTx } from '../lib/db.mjs'
import { claimTask, transition, failTask, reapExpiredLeases } from '../lib/ledger.mjs'
import { resolveHandler } from '../handlers/index.mjs'
import { crearEmitEventOS } from './ingesta-os.mjs'

/**
 * Construye el conector cableado.
 * @param {object} opts
 * @param {object} [opts.cliente]   cliente Mattermost (real) o FakeMattermost (tests/demo)
 * @param {object} [opts.verificador] VerificadorEntrante (si no, se arma desde env / se exige en prod)
 * @param {object} [opts.port]      { query, withTx } (default: el pool del OS)
 * @param {string} [opts.botUserId] @param {string} [opts.tokenEntrante]
 * @param {object} [opts.log] @param {object} [opts.metricas] @param {()=>number} [opts.ahora]
 * @param {string} [opts.workerId] @param {number} [opts.leaseMs]
 */
export function crearConector(opts = {}) {
  const port = opts.port ?? { query, withTx }
  const log = opts.log ?? crearLog()
  const metricas = opts.metricas ?? crearMetricas()
  const cliente = opts.cliente ?? new FakeMattermost()
  const verificador = opts.verificador ?? verificadorDesdeEnv(opts.ahora)

  const repositorio = new RepositorioPostgres(port)
  const svc = new CommunicationService({
    repositorio, verificadorEntrante: verificador, log, metricas,
    ahora: opts.ahora, workerId: opts.workerId ?? 'comm-1', leaseMs: opts.leaseMs,
  })
  svc.registrarAdapter(new MattermostAdapter({
    cliente, botUserId: opts.botUserId ?? process.env.MM_BOT_USER_ID ?? null,
    tokenEntrante: opts.tokenEntrante ?? process.env.MM_INCOMING_TOKEN ?? null,
  }))

  // Puente hacia orq.events con la ingesta OFICIAL inyectada. `opts.emitEvent`
  // permite inyectar una ingesta alternativa en tests (p.ej. fault injection para
  // ejercitar el DLQ de entrada); en producción es siempre la ingesta oficial.
  const puente = new PuenteOrqEvents({ emitEvent: opts.emitEvent ?? crearEmitEventOS(port) })
  const alPuente = (ev) => puente.publicarHaciaOS(ev)
  svc.registrarHandlerEntrante(TIPOS.MENSAJE_RECIBIDO, alPuente)
  svc.registrarHandlerEntrante(TIPOS.COMANDO_INVOCADO, alPuente)

  // Salida: el Work Fabric responde emitiendo un evento canónico saliente que
  // preserva channel, hilo (root_id), correlation_id, causation_id y comm_event_id.
  // Idempotente por intención: intent_id = respuesta:<comm_event_id> (M1).
  async function responderComunicacion(r) {
    return svc.emitir({
      type: TIPOS.MENSAJE_RESPONDER,
      intent_id: `respuesta:${r.comm_event_id}`,
      correlation_id: r.correlation_id,
      causation_id: r.causation_id,
      actor: { tipo: 'os', id: 'work-fabric', display: 'Business OS' },
      data: {
        channel_id: r.channel_id,
        root_id: r.root_post_id, // mismo hilo
        texto: r.texto,
        comm_event_id: r.comm_event_id,
      },
    })
  }

  // Paso REAL del Work Fabric: claim oficial → handler registrado → transición.
  // Reproduce el núcleo de worker.mjs (sin IA) para las tareas de comunicación.
  async function procesarWorkFabric({ lote = 10, leaseSeconds = 30 } = {}) {
    const resumen = { intentados: 0, ok: 0, fallidos: 0 }
    for (let i = 0; i < lote; i++) {
      const task = await claimTask(process.env.WORKER_ID ?? 'comm-wf-1', leaseSeconds)
      if (!task) break
      resumen.intentados++
      const handler = resolveHandler(task.type)
      const ctx = { logger: log, config: { WORKER_ID: process.env.WORKER_ID ?? 'comm-wf-1' }, responderComunicacion }
      try {
        if (!handler) throw new Error(`sin handler para ${task.type}`)
        await transition(task.id, ctx.config.WORKER_ID, 'running')
        const out = await handler(task, ctx)
        await transition(task.id, ctx.config.WORKER_ID, 'reviewing')
        await transition(task.id, ctx.config.WORKER_ID, 'succeeded', { result: out?.result ?? {}, evidence: out?.evidence ?? {} })
        resumen.ok++
      } catch (e) {
        await failTask(task.id, ctx.config.WORKER_ID, String(e?.message ?? e).slice(0, 400), 1000)
        resumen.fallidos++
        log.error?.('work-fabric comm falló', { task_id: task.id, error: String(e?.message ?? e) })
      }
    }
    return resumen
  }

  return {
    svc,
    cliente,
    metricas,
    // entrada (transporte → canónico → inbox); la seguridad se verifica adentro
    recibir: (payload, ctx) => svc.recibir(payload, ctx),
    procesarInbox: (o) => svc.procesarInbox(o), // corre el puente → ingesta OS
    procesarWorkFabric, // claim + handler real + transición + salida
    procesarOutbox: (o) => svc.procesarOutbox(o), // publica en Mattermost
    recuperarLeasesComm: () => svc.recuperarLeases(),
    recuperarLeasesWorkFabric: () => reapExpiredLeases(),
  }
}

/** Arma el verificador HMAC desde el entorno. Fail-closed: sin secreto y sin
 *  COMM_DEV=1 explícito, rechaza todo (no se relaja para la demo). */
function verificadorDesdeEnv(ahora) {
  return new VerificadorEntrante({
    secreto: process.env.MM_INCOMING_SECRET || null,
    ventanaSegundos: Number(process.env.MM_INCOMING_WINDOW ?? 300),
    allowlist: (process.env.MM_INCOMING_ALLOWLIST || '').split(',').map((s) => s.trim()).filter(Boolean),
    modoDev: process.env.COMM_DEV === '1',
    ahora,
  })
}
