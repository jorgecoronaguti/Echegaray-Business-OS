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
// MUERE Y RENACE: ante una conexión perdida este proceso NO reintenta ni reconecta — loguea
// y sale con 75 para que systemd lo levante limpio. Y si deja de completar ticks sin decir
// por qué, el LATIDO lo mata igual. Las dos cosas salieron del incidente del 10/09/2026, que
// lo dejó 23 horas colgado, `active` y con un comprobante del dueño esperando en el inbox:
// `docs/engineering/INCIDENTE-2026-09-10-WORKER-COLGADO-23H.md`.
//
// Uso (staging / entorno de prueba, NO producción sin autorización):
//   DATABASE_URL=… MM_INCOMING_SECRET=… MM_BOT_TOKEN=… node orquestador/comunicacion/worker-comunicacion.mjs
import { crearConector } from './conector.mjs'
import { crearLog } from '../../../communication-service/src/index.mjs'
import { SesionesPostgres, crearVencedorPeriodico, VENCER_INTERVALO_MS_DEFAULT } from './asistencia-sesion.mjs'
import { crearEntregador, ENTREGA_INTERVALO_MS_DEFAULT } from './asistente/entrega-recordatorios.mjs'
import { crearVigiaDeFajosMudos, VIGIA_INTERVALO_MS_DEFAULT } from './comprobantes/vigia-mudos.mjs'
import { alPerderLaConexion, query, withTx } from '../lib/db.mjs'
import { crearLatido, esConexionPerdida, SALIDA_CONEXION_PERDIDA } from '../lib/conexion-perdida.mjs'

const IDLE_MS = Number(process.env.COMM_WORKER_IDLE_MS ?? 2000)
const BUSY_MS = Number(process.env.COMM_WORKER_BUSY_MS ?? 200)
const MAX_IDLE_MS = 15_000
// Cada cuánto se barren los formularios de asistencia vencidos. Ver crearVencedorPeriodico.
const VENCER_MS = Number(process.env.COMM_WORKER_VENCER_MS ?? VENCER_INTERVALO_MS_DEFAULT)
// Cada cuánto se buscan recordatorios internos vencidos. Ver crearEntregador.
const RECORDATORIOS_MS = Number(process.env.COMM_WORKER_RECORDATORIOS_MS ?? ENTREGA_INTERVALO_MS_DEFAULT)
// Cada cuánto se buscan cargas de comprobantes que quedaron abiertas sin decirle nada a nadie.
// Ver `comprobantes/vigia-mudos.mjs`: un fajo mudo no tiene error, ni dead-letter, ni fila — es
// invisible para todos los controles a la vez, y adentro hay plata sin registrar.
const MUDOS_MS = Number(process.env.COMM_WORKER_MUDOS_MS ?? VIGIA_INTERVALO_MS_DEFAULT)
// EL LATIDO — cuánto silencio se tolera antes de salir con error y dejar que systemd
// reinicie. Incidente del 10/09/2026: este worker quedó 23 h colgado en un `await` que
// nunca se resolvió (Supabase reinició, el socket quedó medio abierto y `pg` no tenía
// timeouts). No se recupera una conexión: se muere y se renace. Ver `lib/conexion-perdida.mjs`.
// Default: 5 barridos de sesiones (5 min). Nunca por debajo de 3 intervalos, porque un tick
// legítimo puede tardar (el espejo de Compras, una carga de comprobantes).
const LATIDO_MS = Number(process.env.COMM_WORKER_LATIDO_MS ?? Math.max(5 * VENCER_MS, 180_000))

const log = crearLog()
let parar = false
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function tick(con, vencerSesiones, entregarRecordatorios, vigilarMudos) {
  await con.recuperarLeasesWorkFabric()
  await con.recuperarLeasesComm()
  // Barrido de formularios de asistencia abandonados. Tiene su PROPIO intervalo (este loop
  // puede girar cada 200 ms) y no suma a `trabajo`: no debe mantener el loop en modo busy.
  // Se loguea solo cuando cierra algo, y nunca propaga error (ver crearVencedorPeriodico).
  await vencerSesiones()
  // Entrega de recordatorios internos. Mismo criterio que el barrido de arriba: intervalo
  // propio, no suma a `trabajo` y no propaga error (un recordatorio roto no voltea el canal).
  await entregarRecordatorios()
  // Las cargas de comprobantes que quedaron abiertas y calladas. Mismo criterio que los dos de
  // arriba: intervalo propio, no suma a `trabajo` y no propaga error.
  await vigilarMudos()
  const inbox = await con.procesarInbox({ lote: 20 })
  const wf = await con.procesarWorkFabric({ lote: 20 })
  const outbox = await con.procesarOutbox({ lote: 20 })
  const trabajo = inbox.intentados + wf.intentados + outbox.intentados
  return { trabajo, inbox, wf, outbox }
}

/** EL BUCLE, separado de `main()` para poder probarlo con un tick que NO VUELVE — que es
 *  exactamente la forma que tuvo el incidente. Antes de este cambio no había nada que
 *  probar: el `while` vivía dentro de `main()`, que abre el pool real y el cliente de
 *  Mattermost, y el cuelgue sólo se podía observar en producción a las 23 horas. */
export async function correrBucle({
  tick, latido, log: reg = log, dormir = sleep, debeParar = () => parar,
  idleMs = IDLE_MS, busyMs = BUSY_MS, maxIdleMs = MAX_IDLE_MS,
} = {}) {
  let espera = idleMs
  while (!debeParar() && !latido?.muerto) {
    let r
    try {
      r = await tick()
    } catch (e) {
      // Una conexión perdida NO se reintenta: el cliente ya no existe y el pool puede estar
      // entero en ese estado. Se sale con código ≠ 0 y systemd levanta un proceso limpio.
      if (latido?.fatalSiEsConexionPerdida(e, 'tick')) return { salida: SALIDA_CONEXION_PERDIDA }
      reg?.error?.('tick falló (se reintenta el próximo ciclo)', { error: String(e?.message ?? e) })
      await dormir(Math.min(espera, maxIdleMs))
      espera = Math.min(espera * 2, maxIdleMs)
      continue
    }
    // El latido se toca DESPUÉS del tick completo: mide trabajo terminado, no empezado.
    latido?.tocar()
    if (r.trabajo > 0) {
      espera = busyMs // hubo trabajo: seguí pronto
      reg?.info?.('tick con trabajo', r)
    } else {
      espera = Math.min(Math.round(espera * 1.5), maxIdleMs) // ocioso: backoff suave
    }
    await dormir(espera)
  }
  return { salida: 0 }
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
  // El vigía de fajos mudos vive acá por la misma razón que los otros dos: es el único proceso que
  // tiene a la vez el pool de la base y el cliente de Mattermost. La respuesta va AL HILO del
  // mensaje que la originó, igual que cualquier respuesta de este subsistema.
  const vigilarMudos = crearVigiaDeFajosMudos({
    port: { query, withTx },
    publicar: ({ channelId, rootPostId, texto }) => con.cliente.crearPost({
      channel_id: channelId, message: texto, ...(rootPostId ? { root_id: rootPostId } : {}),
    }),
    intervaloMs: MUDOS_MS, log,
  })
  // El latido: si pasan LATIDO_MS sin un tick completo, el proceso sale con error. Es la
  // única red que cubre un cuelgue cuya causa no conocemos todavía — no necesita clasificar
  // nada, sólo notar el silencio. Va armado ANTES del primer tick.
  const latido = crearLatido({
    toleranciaMs: LATIDO_MS, salir: (c) => process.exit(c), log, nombre: 'worker-comunicacion',
  })
  latido.armar()
  // Y el otro agujero: un cliente OCIOSO del pool que se muere no tiene ningún `await`
  // esperándolo, así que su error sólo aparece como evento del pool. Acá se escucha.
  alPerderLaConexion((err, { corte }) => {
    if (corte) latido.fatalSiEsConexionPerdida(err, 'pool')
    else log.error('pool: error inesperado (no es corte de conexión)', { error: String(err?.message ?? err) })
  })
  log.info('worker-comunicacion arrancado', {
    vencer_sesiones_ms: VENCER_MS, recordatorios_ms: RECORDATORIOS_MS, fajos_mudos_ms: MUDOS_MS,
    latido_ms: latido.toleranciaMs,
  })
  for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { log.info('shutdown pedido', { señal: s }); parar = true })

  const { salida } = await correrBucle({
    tick: () => tick(con, vencerSesiones, entregarRecordatorios, vigilarMudos), latido,
  })
  if (salida !== 0) return // el latido ya hizo process.exit con su log
  latido.desarmar()
  log.info('worker-comunicacion detenido limpio', {})
  process.exit(0)
}

// Guarda de import: sin esto, `import` de este archivo en un test ARRANCA el worker contra
// la base real. Ya pasó con los scripts del pipeline (memoria: «importar un script ejecuta
// main()»), y el consumidor WS de al lado ya se protegía así.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    // Si lo que voltea el arranque es la conexión, el código de salida lo dice: 75 es
    // «volvé a intentar», 1 es «está mal configurado y reiniciar no lo va a arreglar».
    console.error(e)
    process.exit(esConexionPerdida(e) ? SALIDA_CONEXION_PERDIDA : 1)
  })
}
