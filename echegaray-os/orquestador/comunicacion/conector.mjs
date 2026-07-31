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
  CommunicationService, RepositorioPostgres, MattermostAdapter, MattermostCliente, FakeMattermost,
  VerificadorEntrante, PuenteOrqEvents, crearLog, crearMetricas, TIPOS,
} from '../../../communication-service/src/index.mjs'
import { query, withTx } from '../lib/db.mjs'
import { crearRazonadorDeRuteo } from './razonar-ruteo.mjs'
import { claimTask, transition, failTask, reapExpiredLeases } from '../lib/ledger.mjs'
import { resolveHandler } from '../handlers/index.mjs'
import { crearEmitEventOS } from './ingesta-os.mjs'

/**
 * Construye el conector cableado.
 * @param {object} opts
 * @param {object} [opts.cliente]   cliente Mattermost (real o FakeMattermost) INYECTADO (tests/demo)
 * @param {boolean} [opts.permitirFake] habilita FakeMattermost por defecto sin token (dev controlado)
 * @param {object} [opts.verificador] VerificadorEntrante (si no, se arma desde env / se exige en prod)
 * @param {object} [opts.port]      { query, withTx } (default: el pool del OS)
 * @param {string} [opts.botUserId] @param {string} [opts.tokenEntrante]
 * @param {object} [opts.log] @param {object} [opts.metricas] @param {()=>number} [opts.ahora]
 * @param {string} [opts.workerId] @param {number} [opts.leaseMs]
 */
const razonarRuteo = crearRazonadorDeRuteo()

export function crearConector(opts = {}) {
  const port = opts.port ?? { query, withTx }
  const log = opts.log ?? crearLog()
  const metricas = opts.metricas ?? crearMetricas()
  // FAIL-FAST: nunca un Fake silencioso en producción (ver resolverCliente).
  const { cliente, tipoCliente } = resolverCliente(opts)
  log.info('cliente Mattermost activo', { tipo: tipoCliente, base_url: tipoCliente === 'real' ? (process.env.MM_BASE_URL ?? 'http://127.0.0.1:8065') : null })
  // `verificador: null` explícito = la auth vive en el endpoint (comm-service sin
  // verificador). Si no se pasa la clave, se arma desde el entorno (modo legado).
  const verificador = ('verificador' in opts) ? opts.verificador : verificadorDesdeEnv(opts.ahora)

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
        // Mensaje INTERACTIVO: botones y desplegables nativos de Mattermost. Viaja opcional
        // para que una respuesta de texto común siga siendo exactamente lo que era.
        ...(Array.isArray(r.attachments) && r.attachments.length ? { attachments: r.attachments } : {}),
        comm_event_id: r.comm_event_id,
      },
    })
  }

  // Canal PRIVADO (DM bot↔persona) para lo que no puede salir en un canal compartido. Vive
  // acá porque el conector es el único que conoce el cliente de la plataforma; quien lo usa
  // pide "privado" y no sabe cómo se logra. Se declara una sola vez y se comparte: lo usan el
  // ctx del Work Fabric (asistencia) y la entrega de recordatorios del worker.
  const canalPrivadoPara = async (userId) => {
    const bot = opts.botUserId ?? process.env.MM_BOT_USER_ID ?? null
    if (!bot || !userId) return null
    const canal = await cliente.canalDirecto({ usuarioA: bot, usuarioB: userId })
    return canal?.id ?? null
  }

  // Paso REAL del Work Fabric: claim oficial FILTRADO POR LANE 'comunicacion'
  // (PR-4.1) → handler registrado → transición. Reclama SÓLO tareas de la lane de
  // comunicación; nunca roba tareas del worker general (aislamiento atómico en el
  // claim). Reproduce el núcleo de worker.mjs (sin IA).
  const LANE = 'comunicacion'
  async function procesarWorkFabric({ lote = 10, leaseSeconds = 30 } = {}) {
    const resumen = { intentados: 0, ok: 0, fallidos: 0 }
    for (let i = 0; i < lote; i++) {
      const task = await claimTask(process.env.WORKER_ID ?? 'comm-wf-1', leaseSeconds, LANE)
      if (!task) break
      resumen.intentados++
      const handler = resolveHandler(task.type)
      const ctx = {
        logger: log,
        config: { WORKER_ID: process.env.WORKER_ID ?? 'comm-wf-1' },
        responderComunicacion,
        // Razonamiento de RUTEO del Director: elegir especialista cuando el camino
        // determinístico no alcanzó. Puede ser null (sin clave, sin crédito): el Director
        // degrada al catálogo en vez de adivinar un destino.
        razonarRuteo,
        canalPrivadoPara,
        // Cliente de Google INYECTABLE. En producción es undefined y el handler arma el que
        // corresponde. Existe para que el test vertical pueda recorrer el camino completo
        // —mensaje → Director → asistente → capacidad → outbox— sin llamar a Google: sin
        // esta costura, las únicas capacidades verificables de punta a punta serían las que
        // no tocan Google, que son justo las que menos pueden romperse.
        ...(opts.google ? { google: opts.google } : {}),
      }
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
    canalPrivadoPara, // DM bot↔persona (asistencia, recordatorios)
    recuperarLeasesComm: () => svc.recuperarLeases(),
    recuperarLeasesWorkFabric: () => reapExpiredLeases(),
  }
}

/**
 * Resuelve el cliente Mattermost con política FAIL-FAST. NUNCA cae en silencio a
 * un Fake en producción — el incidente del 29/07 (outbox "publicado" contra un
 * FakeMattermost, respuesta perdida) demostró por qué. Prioridad:
 *   1) `opts.cliente` INYECTADO (tests/demo lo pasan explícito) → se usa tal cual.
 *   2) cliente REAL desde el entorno si hay `MM_BOT_TOKEN`.
 *   3) FakeMattermost SÓLO si se habilita EXPLÍCITAMENTE (`opts.permitirFake` o
 *      `COMM_DEV=1`) — dev/test controlado.
 *   4) En cualquier otro caso (producción sin token) → LANZA: el proceso no arranca.
 * Devuelve `{ cliente, tipoCliente: 'real' | 'fake' }`. El token nunca se loguea.
 */
export function resolverCliente(opts = {}) {
  if (opts.cliente) {
    return { cliente: opts.cliente, tipoCliente: opts.cliente instanceof FakeMattermost ? 'fake' : 'real' }
  }
  const token = process.env.MM_BOT_TOKEN
  if (token) {
    const baseUrl = process.env.MM_BASE_URL ?? 'http://127.0.0.1:8065'
    return { cliente: new MattermostCliente({ baseUrl, token }), tipoCliente: 'real' }
  }
  if (opts.permitirFake === true || process.env.COMM_DEV === '1') {
    return { cliente: new FakeMattermost(), tipoCliente: 'fake' }
  }
  throw new Error('conector: cliente Mattermost REAL requerido — falta MM_BOT_TOKEN (fail-closed). Para tests/dev pasá opts.cliente o COMM_DEV=1; nunca hay fallback silencioso a FakeMattermost en producción.')
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
