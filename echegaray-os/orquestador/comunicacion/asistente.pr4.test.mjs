// PRUEBAS VERTICALES DEL ASISTENTE — el camino REAL, sin mocks intermedios.
//
// Un mensaje entra como entra en producción (payload de Mattermost → Communication Service),
// pasa por el inbox, por la ingesta oficial (orq.emit_event + orq.enqueue_task), lo claima el
// Work Fabric, lo rutea el Director, lo atiende el especialista, ejecuta la capacidad, y la
// respuesta sale por el outbox. Contra un Postgres REAL y descartable.
//
// Lo único falso es el borde externo: el cliente de Mattermost (FakeMattermost, que ya usa el
// resto de la suite) y el cliente de Google. Todo lo del medio es el código de producción.
//
// Correr: node orquestador/comunicacion/test-pr4.mjs
import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { query, closePool } from '../lib/db.mjs'
import { crearConector } from './conector.mjs'
import { FakeMattermost, crearLog, crearMetricas } from '../../../communication-service/src/index.mjs'
import { RecordatoriosPostgres } from './asistente/recordatorios.mjs'
import { crearEntregador } from './asistente/entrega-recordatorios.mjs'

const salta = !process.env.PG_TEST_URL
const opts = { skip: salta ? 'PG_TEST_URL no seteada (usar node orquestador/comunicacion/test-pr4.mjs)' : false }

const JORGE = { id: 'u-jorge', nombre: 'jorge', email: 'jorge@ecsas.com.ar' }
const RODRIGO = { id: 'u-rodrigo', nombre: 'rodrigo', email: 'rodrigo@ecsas.com.ar' }
const CANAL = 'canal-dm-jorge'
const BOT = 'u-bot-os'

// ── Google falso: cuenta las llamadas y devuelve efectos con id, como el real ──
function googleFalso({ archivos = [], eventos = [] } = {}) {
  const llamadas = []
  return {
    llamadas,
    async searchFile(n) { llamadas.push(['searchFile', n]); return archivos },
    async getMeta(id) {
      llamadas.push(['getMeta', id])
      const a = archivos.find((x) => x.id === id) ?? { id, name: 'archivo' }
      return { ...a, webViewLink: `https://drive.google.com/file/d/${id}/view`, modifiedTime: '2026-07-27T10:00:00Z' }
    },
    async apiGetSheets(url) { llamadas.push(['apiGet', url]); throw Object.assign(new Error('404'), { status: 404 }) },
    async calendarUpcoming() { llamadas.push(['calendarUpcoming']); return eventos },
    async calendarCreateEvent(ev) {
      llamadas.push(['calendarCreateEvent', ev.summary, ev.start])
      return { id: `ev-${eventos.length + llamadas.length}`, summary: ev.summary, start: ev.start, end: ev.end, link: 'https://calendar.google.com/x' }
    },
    async tasksLists() { return [{ id: '@default', title: 'Mis tareas' }] },
    async tasksList() { return [] },
    async taskCreate(t) { llamadas.push(['taskCreate', t.title, t.due]); return { id: 'tarea-1', title: t.title, due: t.due, status: 'needsAction' } },
  }
}

function armar({ google } = {}) {
  const cliente = new FakeMattermost()
  const con = crearConector({
    cliente, verificador: null, botUserId: BOT, google,
    log: crearLog(() => {}), metricas: crearMetricas(), workerId: 'asis-test',
  })
  return { con, cliente }
}

/** Un mensaje como el que arma el consumidor WebSocket en producción. */
const mensaje = (texto, { post_id = `p-${Math.random().toString(36).slice(2)}`, quien = JORGE } = {}) => ({
  user_id: quien.id, user_name: quien.nombre, channel_id: CANAL, channel_type: 'D',
  post_id, text: texto, root_id: post_id,
})

async function pedir(con, texto, meta) {
  const ev = await con.recibir(mensaje(texto, meta), { plataforma: 'mattermost' })
  await con.procesarInbox()
  await con.procesarWorkFabric()
  await con.procesarOutbox()
  return ev
}

const ultimoTexto = (cliente) => cliente.posts?.[cliente.posts.length - 1]?.message ?? ''

beforeEach(async () => {
  if (salta) return
  await query('truncate orq.tasks, orq.events cascade')
  await query('truncate comunicacion.eventos, comunicacion.inbox, comunicacion.outbox, comunicacion.dead_letter, comunicacion.rechazos_entrantes restart identity')
  await query('truncate comunicacion.recordatorios, comunicacion.asistente_pendientes, comunicacion.asistente_ejecuciones, comunicacion.identidades restart identity cascade')
  // Las dos personas autorizaron su Google: sin eso, Calendar y Tasks quedan deshabilitadas
  // A PROPÓSITO (no se ofrece lo que crearía el evento en la cuenta de otro).
  for (const p of [JORGE, RODRIGO]) {
    await query('insert into orq.google_tokens (email, refresh_token, scopes) values ($1,$2,$3) on conflict (email) do nothing',
      [p.email, 'rt-de-prueba', 'drive calendar tasks'])
  }
  for (const p of [JORGE, RODRIGO]) {
    await query(
      `insert into comunicacion.identidades (plataforma, plataforma_user_id, plataforma_username, display, email)
       values ('mattermost',$1,$2,$3,$4) on conflict do nothing`,
      [p.id, p.nombre, p.nombre === 'jorge' ? 'Jorge Corona' : 'Rodrigo Echegaray', p.email])
  }
})

after(async () => { if (!salta) await closePool() })

// 1 ────────────────────────────────────────────────────────────────────────────
test('1 · "¿qué sabés hacer?" se responde desde el registro y sin gastar un token', opts, async () => {
  const { con, cliente } = armar({ google: googleFalso() })
  await pedir(con, '@os ¿qué sabés hacer?')
  const t = ultimoTexto(cliente)
  assert.match(t, /Puedo:/)
  assert.match(t, /Drive/i)
  assert.match(t, /recordar/i)
  // Lo que NO puede prometer: capacidades de otros módulos ni cosas que no existen.
  assert.doesNotMatch(t, /asistencia|jornales|flujo de caja|an[aá]lisis financiero/i)
})

// 2 ────────────────────────────────────────────────────────────────────────────
test('2 · "buscame el flujo de caja" devuelve el archivo real con su enlace', opts, async () => {
  const g = googleFalso({ archivos: [{ id: 'f-1', name: 'Flujo de Caja - Cash Flow', mimeType: 'application/vnd.google-apps.spreadsheet' }] })
  const { con, cliente } = armar({ google: g })
  await pedir(con, '@os buscame el flujo de caja')
  const t = ultimoTexto(cliente)
  assert.match(t, /Flujo de Caja/)
  assert.match(t, /drive\.google\.com/)
  assert.ok(g.llamadas.some(([m]) => m === 'searchFile'), 'no llegó a buscar en Drive')
})

// 3 ────────────────────────────────────────────────────────────────────────────
test('3 · "recordame cargar saldos todos los lunes a las 8" queda persistido y es recurrente', opts, async () => {
  const { con, cliente } = armar({ google: googleFalso() })
  await pedir(con, '@os recordame cargar saldos todos los lunes a las 8')
  const { rows } = await query('select * from comunicacion.recordatorios')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].creador_user_id, JORGE.id)
  assert.equal(rows[0].destinatario_user_id, JORGE.id, 'un recordatorio propio no puede quedar a nombre de otro')
  assert.equal(rows[0].cadencia, 'weekly:lun:08:00')
  assert.match(rows[0].contenido, /saldos/i)
  assert.match(ultimoTexto(cliente), /lunes/i)
})

// 4 ────────────────────────────────────────────────────────────────────────────
test('4 · "recordale a Rodrigo … el jueves a las 20" resuelve la identidad REAL del destinatario', opts, async () => {
  const { con, cliente } = armar({ google: googleFalso() })
  await pedir(con, '@os recordale a Rodrigo buscar las llaves el jueves a las 20')
  const { rows } = await query('select * from comunicacion.recordatorios')
  assert.equal(rows.length, 1, `el bot contestó: ${ultimoTexto(cliente)}`)
  assert.equal(rows[0].creador_user_id, JORGE.id)
  assert.equal(rows[0].destinatario_user_id, RODRIGO.id)
  assert.match(rows[0].contenido, /llaves/i)
  assert.equal(new Date(rows[0].proxima_ejecucion).getUTCHours(), 23, 'las 20 de San Juan son las 23 UTC')
})

// 4b ───────────────────────────────────────────────────────────────────────────
test('4b · a alguien que NO existe no se le manda nada: se dice que no se lo pudo identificar', opts, async () => {
  const { con, cliente } = armar({ google: googleFalso() })
  await pedir(con, '@os recordale a Emiliano cargar las fotos mañana a las 18')
  const { rows } = await query('select count(*)::int n from comunicacion.recordatorios')
  assert.equal(rows[0].n, 0, 'se creó un recordatorio para alguien que no existe')
  assert.match(ultimoTexto(cliente), /Emiliano/i)
})

// 5 ────────────────────────────────────────────────────────────────────────────
test('5 · "agendá una reunión con Rodrigo mañana a las 9" crea el evento REAL', opts, async () => {
  const g = googleFalso()
  const { con, cliente } = armar({ google: g })
  await pedir(con, '@os agendá una reunión con Rodrigo mañana a las 9')
  const creado = g.llamadas.find(([m]) => m === 'calendarCreateEvent')
  assert.ok(creado, 'nunca llamó a Calendar')
  assert.match(ultimoTexto(cliente), /09:00/)
})

// 6 ────────────────────────────────────────────────────────────────────────────
test('6 · "creame una tarea para llamar a Santander el viernes" crea la tarea REAL', opts, async () => {
  const g = googleFalso()
  const { con, cliente } = armar({ google: g })
  await pedir(con, '@os creame una tarea para llamar a Santander el viernes')
  const creado = g.llamadas.find(([m]) => m === 'taskCreate')
  assert.ok(creado, 'nunca llamó a Google Tasks')
  assert.match(String(creado[1]), /Santander/i)
  // El vencimiento va como FECHA (Tasks ignora la hora): un instante con hora corría el día.
  assert.match(String(creado[2] ?? ''), /^\d{4}-\d{2}-\d{2}/)
  assert.match(ultimoTexto(cliente), /Santander/i)
})

// 7 ────────────────────────────────────────────────────────────────────────────
test('7 · repetir el MISMO webhook no duplica nada', opts, async () => {
  const g = googleFalso()
  const { con } = armar({ google: g })
  const meta = { post_id: 'p-repetido' }
  await pedir(con, '@os recordame pagar la tarjeta el martes a las 21', meta)
  await pedir(con, '@os recordame pagar la tarjeta el martes a las 21', meta)
  const rec = await query('select count(*)::int n from comunicacion.recordatorios')
  const tareas = await query(`select count(*)::int n from orq.tasks where type = 'comunicacion.responder'`)
  assert.equal(rec.rows[0].n, 1, 'el reintento del mismo mensaje creó un segundo recordatorio')
  assert.equal(tareas.rows[0].n, 1, 'el reintento del mismo mensaje creó una segunda tarea')
})

// 7b ───────────────────────────────────────────────────────────────────────────
test('7b · el mismo mensaje con efecto externo no crea dos eventos de Calendar', opts, async () => {
  const g = googleFalso()
  const { con } = armar({ google: g })
  const meta = { post_id: 'p-evento' }
  await pedir(con, '@os agendá visita a la obra el jueves a las 15', meta)
  // Se fuerza el reintento DENTRO de la tarea: se borra la tarea para que vuelva a entrar
  // por el mismo comm_event_id, que es lo que pasa cuando vence un lease y otro worker la
  // reclama. La barrera que tiene que actuar es asistente_ejecuciones, no el dedupe_key.
  await query(`delete from orq.tasks where type = 'comunicacion.responder'`)
  await query('update comunicacion.inbox set estado = $1, lease_expires_at = null', ['pendiente'])
  await con.procesarInbox()
  await con.procesarWorkFabric()
  const creados = g.llamadas.filter(([m]) => m === 'calendarCreateEvent')
  assert.equal(creados.length, 1, `se creó el evento ${creados.length} veces`)
})

// 8 ────────────────────────────────────────────────────────────────────────────
test('8 · los recordatorios sobreviven al reinicio: el estado vive en la base', opts, async () => {
  const { con } = armar({ google: googleFalso() })
  await pedir(con, '@os recordame llamar al contador mañana a las 10')
  // "Reinicio": instancias NUEVAS de todo, sin un solo byte de estado en memoria.
  const repo = new RecordatoriosPostgres({ query, withTx: (fn) => fn({ query }) })
  const { rows } = await query('select id, estado from comunicacion.recordatorios')
  assert.equal(rows[0].estado, 'active')
  assert.ok(await repo.porId(rows[0].id), 'el recordatorio no sobrevivió al reinicio')
})

// 9 ────────────────────────────────────────────────────────────────────────────
test('9 · una entrega que falla se reintenta y no se da por entregada', opts, async () => {
  const { con, cliente } = armar({ google: googleFalso() })
  await pedir(con, '@os recordame llamar al banco dentro de dos horas')
  const creado = await query('select count(*)::int n from comunicacion.recordatorios')
  assert.equal(creado.rows[0].n, 1, `el bot contestó: ${ultimoTexto(cliente)}`)
  await query(`update comunicacion.recordatorios set proxima_ejecucion = now() - interval '1 minute'`)

  const port = { query, withTx: (fn) => fn({ query }) }
  let falla = true
  const entregar = crearEntregador({
    port,
    abrirDM: async () => 'canal-dm',
    publicar: async () => { if (falla) throw new Error('mattermost caído'); return { id: 'post-ok' } },
    intervaloMs: 0, log: crearLog(() => {}),
  })
  await entregar()
  let r = (await query('select estado, intentos from comunicacion.recordatorios')).rows[0]
  assert.equal(r.estado, 'active', 'se dio por entregado un recordatorio que no salió')
  assert.ok(r.intentos >= 1, 'no contó el intento fallido')

  // Se levanta Mattermost y se libera el lease: el reintento entrega de verdad.
  falla = false
  await query('update comunicacion.recordatorios set lease_hasta = null')
  await entregar()
  r = (await query('select estado from comunicacion.recordatorios')).rows[0]
  assert.equal(r.estado, 'delivered')
  const e = await query(`select estado, post_id from comunicacion.recordatorio_entregas`)
  assert.equal(e.rows.length, 1, 'quedó más de una fila para la misma ocurrencia')
  assert.equal(e.rows[0].estado, 'entregada')
  assert.equal(e.rows[0].post_id, 'post-ok')
})

// 10 ───────────────────────────────────────────────────────────────────────────
test('10 · el bot no se contesta a sí mismo', opts, async () => {
  const { con } = armar({ google: googleFalso() })
  const ev = await con.recibir(
    { ...mensaje('@os recordame algo'), user_id: BOT, user_name: 'os' },
    { plataforma: 'mattermost' },
  )
  assert.ok(!ev || ev.ignorado || ev.rechazado, 'el eco del propio bot generó un evento')
  const { rows } = await query('select count(*)::int n from comunicacion.recordatorios')
  assert.equal(rows[0].n, 0)
})

// 11 ───────────────────────────────────────────────────────────────────────────
test('11 · un pedido que no es del asistente no se lo lleva el asistente', opts, async () => {
  const { con, cliente } = armar({ google: googleFalso() })
  await pedir(con, '@os asistencia')
  // No se afirma qué contestó Personal IA (depende de JORNALES): se afirma que el asistente
  // no interceptó el mensaje ni creó nada suyo.
  const rec = await query('select count(*)::int n from comunicacion.recordatorios')
  assert.equal(rec.rows[0].n, 0)
  assert.doesNotMatch(ultimoTexto(cliente), /^Puedo:/)
})
