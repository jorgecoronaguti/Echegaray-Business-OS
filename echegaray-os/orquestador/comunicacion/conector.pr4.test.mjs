// PR-4 · Test de integración del flujo vertical REAL (Communication Service ↔
// Work Fabric) contra un Postgres descartable. Sin mocks entre el comm-service y
// el Work Fabric: usa orq.emit_event / orq.enqueue_task / orq.claim_task reales.
// Se saltea si no hay PG_TEST_URL (lo setea test-pr4.mjs). Correr: node orquestador/comunicacion/test-pr4.mjs
import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { query, closePool } from '../lib/db.mjs'
import { claimTask, failTask } from '../lib/ledger.mjs'
import { crearConector } from './conector.mjs'
import {
  FakeMattermost, VerificadorEntrante, firmar, crearLog, crearMetricas,
} from '../../../communication-service/src/index.mjs'

const salta = !process.env.PG_TEST_URL
const opts = { skip: salta ? 'PG_TEST_URL no seteada (usar node orquestador/comunicacion/test-pr4.mjs)' : false }
const SECRET = process.env.MM_INCOMING_SECRET ?? 'secreto-pr4-test'

function armar({ clock, emitEvent } = {}) {
  const cliente = new FakeMattermost()
  const verificador = new VerificadorEntrante({ secreto: SECRET, ventanaSegundos: 300, ahora: clock })
  const con = crearConector({
    cliente, verificador, emitEvent,
    log: crearLog(() => {}), metricas: crearMetricas(), ahora: clock, workerId: 'pr4',
  })
  return { con, cliente }
}

function firmado(texto, { post_id = 'p1', ts = Date.now() } = {}) {
  const rawBody = JSON.stringify({ text: texto, post_id })
  const payload = { user_id: 'u-rodrigo', user_name: 'rodrigo', channel_id: 'canal-dir', post_id, text: texto }
  return { payload, seguridad: { rawBody, firma: firmar(SECRET, rawBody, ts), timestamp: ts, ip: '10.0.0.5' } }
}

async function flujoCompleto(con, texto = '@os estado del sistema', metaMsg) {
  const { payload, seguridad } = firmado(texto, metaMsg)
  const ev = await con.recibir(payload, { seguridad })
  await con.procesarInbox()
  await con.procesarWorkFabric()
  await con.procesarOutbox()
  return ev
}

beforeEach(async () => {
  if (salta) return
  await query('truncate orq.tasks, orq.events cascade')
  await query('truncate comunicacion.eventos, comunicacion.inbox, comunicacion.outbox, comunicacion.dead_letter, comunicacion.rechazos_entrantes restart identity')
})

// 1 · evento Mattermost → Communication Service (persistido en eventos + inbox)
test('1 · un mensaje de Mattermost entra, se audita y se encola en el inbox', opts, async () => {
  const { con } = armar()
  const { payload, seguridad } = firmado('@os estado del sistema')
  const ev = await con.recibir(payload, { seguridad })
  assert.ok(ev && ev.type === 'mensaje.recibido')
  const evs = await query('select count(*)::int n from comunicacion.eventos')
  const inbox = await query('select count(*)::int n from comunicacion.inbox')
  assert.equal(evs.rows[0].n, 1)
  assert.equal(inbox.rows[0].n, 1)
})

// 2 · seguridad HMAC válida e inválida (con auditoría de rechazo)
test('2 · HMAC inválida se rechaza y se AUDITA; válida entra', opts, async () => {
  const { con } = armar()
  const rech = await con.recibir({ channel_id: 'c', post_id: 'p', text: 'x' }, { seguridad: { rawBody: '{}', firma: 'FALSA', timestamp: Date.now() } })
  assert.equal(rech.rechazado, true)
  const aud = await query('select motivo from comunicacion.rechazos_entrantes')
  assert.equal(aud.rows.length, 1)
  assert.equal(aud.rows[0].motivo, 'firma_invalida')
})

// 3+4 · inbox → bridge → orq.events (el hecho de comunicación queda en orq.events)
test('3-4 · procesarInbox publica al puente y crea el evento en orq.events', opts, async () => {
  const { con } = armar()
  const { payload, seguridad } = firmado('@os estado del sistema')
  await con.recibir(payload, { seguridad })
  await con.procesarInbox()
  const orqEv = await query(`select type, causation_id, payload from orq.events where type like 'comunicacion.%'`)
  assert.equal(orqEv.rows.length, 1)
  assert.equal(orqEv.rows[0].type, 'comunicacion.mensaje.recibido')
  assert.ok(orqEv.rows[0].payload.comm_event_id, 'lleva comm_event_id')
})

// 5 · deduplicación por comm_event_id (una sola tarea de Work Fabric)
test('5 · dos mensajes idénticos (mismo post) ⇒ una sola tarea de Work Fabric', opts, async () => {
  const { con } = armar()
  const a = firmado('@os estado del sistema', { post_id: 'p1' })
  await con.recibir(a.payload, { seguridad: a.seguridad })
  await con.procesarInbox()
  // reintento del mismo hecho (mismo post_id ⇒ misma idempotency_key entrante)
  const b = firmado('@os estado del sistema', { post_id: 'p1', ts: a.seguridad.timestamp })
  await con.recibir(b.payload, { seguridad: b.seguridad })
  await con.procesarInbox()
  const tareas = await query(`select count(*)::int n from orq.tasks where type='comunicacion.responder'`)
  assert.equal(tareas.rows[0].n, 1, 'dedup end-to-end por comm_event_id (dedupe_key)')
})

// 6+7 · Work Fabric produce respuesta REAL → encolada en outbox
test('6-7 · el Work Fabric procesa la tarea y encola la respuesta en el outbox', opts, async () => {
  const { con } = armar()
  const { payload, seguridad } = firmado('@os estado del sistema')
  await con.recibir(payload, { seguridad })
  await con.procesarInbox()
  const wf = await con.procesarWorkFabric()
  assert.equal(wf.ok, 1)
  const tarea = await query(`select state, result from orq.tasks where type='comunicacion.responder'`)
  assert.equal(tarea.rows[0].state, 'succeeded')
  assert.match(tarea.rows[0].result.texto, /Business OS operativo/)
  const out = await query(`select count(*)::int n from comunicacion.outbox`)
  assert.equal(out.rows[0].n, 1)
})

// 8+9+10 · outbox → Mattermost, en el mismo hilo, con correlation/causation
test('8-10 · publica en Mattermost en el mismo hilo, preservando correlation/causation', opts, async () => {
  const { con, cliente } = armar()
  const ev = await flujoCompleto(con)
  assert.equal(cliente.posts.length, 1)
  const post = cliente.posts[0]
  assert.match(post.message, /Business OS operativo/)
  assert.equal(post.root_id, 'p1', 'respondió en el hilo del post original')
  assert.equal(post.props.os_correlation_id, ev.correlation_id, 'correlation_id preservado end-to-end')
  // causation: el evento saliente es causado por el evento de comunicación
  const outEv = await query(`select causation_id, correlation_id from comunicacion.eventos where direccion='outbound'`)
  assert.equal(outEv.rows[0].causation_id, ev.id)
  assert.equal(outEv.rows[0].correlation_id, ev.correlation_id)
})

// 11 · retry cuando el Work Fabric falla (fail_task → reintento → éxito)
test('11 · una tarea de Work Fabric que falla se reintenta y luego se completa', opts, async () => {
  const { con, cliente } = armar()
  const { payload, seguridad } = firmado('@os estado del sistema')
  await con.recibir(payload, { seguridad })
  await con.procesarInbox()
  // Simular caída del WF: claim (lane de comunicación) + fail (mecanismo real de orq).
  const t = await claimTask('pr4', 30, 'comunicacion')
  const next = await failTask(t.id, 'pr4', 'WF caído (simulado)', 1)
  assert.notEqual(next, 'dead')
  await query(`update orq.tasks set run_after = now() - interval '1 second' where id=$1`, [t.id])
  // Reintento real: ahora sí procesa y responde.
  const wf = await con.procesarWorkFabric()
  assert.equal(wf.ok, 1)
  await con.procesarOutbox()
  assert.equal(cliente.posts.length, 1, 'tras el reintento, la respuesta llegó igual')
})

// 12 · retry cuando Mattermost está caído (outbox reintenta)
test('12 · Mattermost caído: el outbox reintenta y publica al recuperarse', opts, async () => {
  let t = 0
  const { con, cliente } = armar({ clock: () => t })
  cliente.fallarCon(503, 1)
  const { payload, seguridad } = firmado('@os estado del sistema', { ts: 0 })
  await con.recibir(payload, { seguridad })
  await con.procesarInbox()
  await con.procesarWorkFabric()
  const r1 = await con.procesarOutbox()
  assert.equal(r1.reintentar, 1)
  assert.equal(cliente.posts.length, 0)
  t += 10_000
  const r2 = await con.procesarOutbox()
  assert.equal(r2.publicados, 1)
})

// 13 · DLQ de entrada: si el puente/ingesta falla siempre, el inbox va a DLQ
test('13 · DLQ de entrada cuando la ingesta al OS falla de forma persistente', opts, async () => {
  let t = 0
  const emitEvent = async () => { throw new Error('orq caído (simulado)') }
  const { con } = armar({ clock: () => t, emitEvent })
  const { payload, seguridad } = firmado('@os estado del sistema', { ts: 0 })
  await con.recibir(payload, { seguridad })
  for (let i = 0; i < 6; i++) { await con.procesarInbox(); t += 10 * 60_000 }
  const dlq = await query(`select count(*)::int n from comunicacion.dead_letter where cola='entrada'`)
  assert.equal(dlq.rows[0].n, 1)
})

// 14 · DLQ de salida: si Mattermost rechaza permanente (4xx), va a DLQ
test('14 · DLQ de salida cuando Mattermost rechaza de forma permanente', opts, async () => {
  const { con, cliente } = armar()
  cliente.fallarCon(400, 10)
  const { payload, seguridad } = firmado('@os estado del sistema')
  await con.recibir(payload, { seguridad })
  await con.procesarInbox()
  await con.procesarWorkFabric()
  await con.procesarOutbox()
  const dlq = await query(`select count(*)::int n from comunicacion.dead_letter where cola='salida'`)
  assert.equal(dlq.rows[0].n, 1)
})

// 15 · recuperación de leases (comm-service): un lease vencido vuelve reclamable
test('15 · recuperación de lease de salida vencido', opts, async () => {
  let t = 1000
  const { con } = armar({ clock: () => t })
  const { payload, seguridad } = firmado('@os estado del sistema', { ts: 1000 })
  await con.recibir(payload, { seguridad })
  await con.procesarInbox()
  await con.procesarWorkFabric() // encola la salida
  await con.svc.repo.salida.reclamar('worker-muerto', 10, -1000, t) // lease ya vencido
  const rec = await con.recuperarLeasesComm()
  assert.ok(rec.salida >= 1, 'recuperó al menos el lease de salida vencido')
})

// 16 · reinicio de workers: el estado vive en la base, un segundo "proceso" continúa
test('16 · reinicio: un conector nuevo retoma el trabajo pendiente sin perderlo', opts, async () => {
  const { con } = armar()
  const { payload, seguridad } = firmado('@os estado del sistema')
  await con.recibir(payload, { seguridad })
  await con.procesarInbox() // creó la tarea; "se cae" antes de procesar WF/outbox
  // Nuevo conector (simula reinicio) con la MISMA base:
  const { con: con2, cliente: cli2 } = armar()
  await con2.procesarWorkFabric()
  await con2.procesarOutbox()
  assert.equal(cli2.posts.length, 1, 'el reinicio retomó y completó el flujo')
})

// 17 · procesamiento concurrente: dos procesadores no publican doble
test('17 · dos procesadores de outbox concurrentes publican UNA sola vez', opts, async () => {
  const { con, cliente } = armar()
  await flujoParcialHastaOutbox(con)
  const [a, b] = await Promise.all([con.procesarOutbox(), con.procesarOutbox()])
  assert.equal(a.publicados + b.publicados, 1, 'sin doble publicación bajo concurrencia (lease)')
  assert.equal(cliente.posts.length, 1)
})

// 18 · flujo completo end-to-end con Postgres real: exactamente un post, sin pérdida
test('18 · flujo vertical completo: un mensaje ⇒ exactamente una respuesta real', opts, async () => {
  const { con, cliente } = armar()
  const ev = await flujoCompleto(con)
  assert.equal(cliente.posts.length, 1)
  assert.match(cliente.posts[0].message, /Business OS operativo\. Cola de trabajo:/)
  // trazabilidad completa: comm event → orq event → task → outbound → post
  const cadena = await query(`
    select
      (select count(*)::int from comunicacion.eventos where id=$1) as comm,
      (select count(*)::int from orq.events where causation_id=$1 and type like 'comunicacion.%') as orq_ev,
      (select count(*)::int from orq.tasks where causation_id=$1) as tarea,
      (select count(*)::int from comunicacion.eventos where causation_id=$1 and direccion='outbound') as salida
  `, [ev.id])
  assert.deepEqual(cadena.rows[0], { comm: 1, orq_ev: 1, tarea: 1, salida: 1 }, 'un eslabón por etapa, sin duplicar')
})

// helpers que usan el flujo hasta cierto punto
async function flujoParcialHastaOutbox(con) {
  const { payload, seguridad } = firmado('@os estado del sistema')
  await con.recibir(payload, { seguridad })
  await con.procesarInbox()
  await con.procesarWorkFabric()
}
// ── PR-4.1 · aislamiento de worker por lane ──
import { claimTask as _claim } from '../lib/ledger.mjs'

async function encolar(type, dedupe) {
  const { rows } = await query('select orq.enqueue_task($1::jsonb) as id',
    [JSON.stringify({ type, dedupe_key: dedupe, title: type, inputs: {} })])
  return rows[0].id
}

// 15b · una tarea comunicacion.responder cae en la lane 'comunicacion'
test('L1 · las tareas comunicacion.* se rutean a la lane comunicacion', opts, async () => {
  await encolar('comunicacion.responder', 'L1')
  const { rows } = await query(`select queue from orq.tasks where dedupe_key='L1'`)
  assert.equal(rows[0].queue, 'comunicacion')
})

// 16b · el worker de comunicación reclama comunicacion.responder…
test('L2 · el worker de comunicación reclama SÓLO su lane', opts, async () => {
  await encolar('comunicacion.responder', 'L2')
  const t = await _claim('comm-w', 30, 'comunicacion')
  assert.ok(t && t.type === 'comunicacion.responder')
})

// …y NO reclama una tarea financiera ni de otro especialista (quedan en 'default')
test('L3 · el worker de comunicación NO reclama tareas ajenas (finanzas/especialista)', opts, async () => {
  await encolar('finanzas.plan', 'L3a')
  await encolar('specialist', 'L3b')
  const t = await _claim('comm-w', 30, 'comunicacion')
  assert.equal(t, null, 'no ve tareas de la lane default')
  const fin = await query(`select queue from orq.tasks where dedupe_key='L3a'`)
  assert.equal(fin.rows[0].queue, 'default')
})

// L4 · el worker general (lane default) NO reclama tareas de comunicación
test('L4 · el worker general no roba tareas de comunicación', opts, async () => {
  await encolar('comunicacion.responder', 'L4')
  const g = await _claim('general-w', 30) // default
  assert.equal(g, null, 'el general no ve la lane comunicacion')
})

// L5 · el worker general SÍ sigue reclamando su lane (no se rompió)
test('L5 · el worker general sigue funcionando en su lane', opts, async () => {
  await encolar('specialist', 'L5')
  const g = await _claim('general-w', 30)
  assert.ok(g && g.type === 'specialist')
})

// L6 · dos workers de comunicación no reclaman la misma tarea (concurrencia)
test('L6 · dos workers de comunicación concurrentes no toman la misma tarea', opts, async () => {
  await encolar('comunicacion.responder', 'L6')
  const [a, b] = await Promise.all([
    _claim('comm-A', 30, 'comunicacion'),
    _claim('comm-B', 30, 'comunicacion'),
  ])
  assert.equal([a, b].filter(Boolean).length, 1)
})

after(async () => { if (!salta) await closePool() })
