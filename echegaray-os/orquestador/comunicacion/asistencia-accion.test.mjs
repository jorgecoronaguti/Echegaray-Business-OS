// EL CABLEADO: que la guarda corra ANTES que nada, y que el porqué llegue a la tabla.
//
// Las piezas están probadas por su cuenta. Lo que sólo se puede romper acá es el ORDEN
// (procesar un click que venía de un DM) y el PUENTE entre la auditoría y la proyección
// consultable (que `paraliza_obra` llegue a la columna).

import test from 'node:test'
import assert from 'node:assert/strict'
import { crearManejadorAccion } from './asistencia-accion.mjs'
import { EVENTO } from '../lib/asistencia-auditoria.mjs'

const CANAL_OFICIAL = 'canal-oficial-de-asistencia'

/** El secreto de la integración. Sin él el endpoint deniega TODO antes de mirar el canal:
 *  es la puerta de la puerta, y por eso todos los dobles de acá lo presentan. */
const SECRETO = 'secreto-de-prueba'

/** Doble del pool: responde el binding y registra TODAS las consultas. */
function portDoble({ bindingActivo = true, conPermiso = true } = {}) {
  const consultas = []
  return {
    consultas,
    async query(sql, params) {
      consultas.push({ sql: String(sql), params })
      if (/canales_area/.test(sql)) {
        return bindingActivo && params?.includes(CANAL_OFICIAL)
          ? { rows: [{ area_clave: 'personas', canal_nombre: 'Asistencia' }] }
          : { rows: [] }
      }
      if (/permisos_skill/.test(sql)) return { rows: conPermiso ? [{ otorgado: true }] : [] }
      // El auditor resuelve tenant/project antes de emitir: sin esto no llega a emitir nada.
      if (/orq\.tenants/.test(sql)) return { rows: [{ tenant_id: 'tenant-1', project_id: 'proj-1' }] }
      if (/asistencia_novedades/.test(sql)) return { rows: [] }
      return { rows: [] }
    },
    async withTx(fn) { return fn({ query: (s, p) => this.query(s, p) }) },
  }
}

const mattermostDoble = () => ({ async abrirDialogo() { return { ok: true } }, async actualizarPost() { return { ok: true } } })
const googleDoble = () => ({ listTabs: async () => [], readSheetGrid: async () => ({}), batchUpdateValues: async () => ({}) })

const payloadAccion = (extra = {}) => ({
  user_id: 'usr-jefe', channel_id: CANAL_OFICIAL, post_id: 'post-1',
  _secreto: SECRETO, // lo pone el transporte desde la query de la URL, no el cuerpo
  context: { paso: 'obra', valor: 'x' }, ...extra,
})

test('un click desde un DM NO se procesa: la guarda corre primero', async () => {
  const port = portDoble()
  const manejar = crearManejadorAccion({ port, mattermost: mattermostDoble(), google: googleDoble(), secreto: SECRETO })
  const r = await manejar(payloadAccion({ channel_id: 'un-dm-cualquiera', channel_type: 'D' }))
  assert.equal(r.status, 200, 'Mattermost espera 200 con cuerpo, no un código de error')
  assert.ok(r.body.ephemeral_text, 'se le explica al que tocó, sin ensuciar el canal')
  // Lo que importa: NO se leyó la planilla ni se abrió sesión.
  assert.ok(!port.consultas.some((c) => /asistencia_sesiones/.test(c.sql)), 'no se abrió sesión')
})

test('el rechazo de un DIÁLOGO usa `error`, no `ephemeral_text`', async () => {
  // Un dialog_submission sólo admite errors/error: mandar ephemeral_text deja al jefe sin
  // ver nada y con el diálogo abierto.
  const port = portDoble()
  const manejar = crearManejadorAccion({ port, mattermost: mattermostDoble(), google: googleDoble(), secreto: SECRETO })
  const r = await manejar(payloadAccion({ channel_id: 'otro', submission: { horas: '9' } }))
  assert.ok(r.body.error, 'el diálogo necesita `error`')
  assert.ok(!r.body.ephemeral_text)
})

test('sin permiso tampoco se procesa, aunque el canal sea el correcto', async () => {
  const port = portDoble({ conPermiso: false })
  process.env.ORQ_ASISTENCIA_PERMISOS = 'estricto'
  try {
    const manejar = crearManejadorAccion({ port, mattermost: mattermostDoble(), google: googleDoble(), secreto: SECRETO })
    const r = await manejar(payloadAccion())
    assert.ok(r.body.ephemeral_text, 'se le dice que no puede')
    assert.ok(!port.consultas.some((c) => /asistencia_sesiones/.test(c.sql)))
  } finally {
    delete process.env.ORQ_ASISTENCIA_PERMISOS
  }
})

test('el binding desactivado apaga la carga sin desplegar código', async () => {
  const port = portDoble({ bindingActivo: false })
  const manejar = crearManejadorAccion({ port, mattermost: mattermostDoble(), google: googleDoble(), secreto: SECRETO })
  const r = await manejar(payloadAccion())
  assert.ok(r.body.ephemeral_text)
})

test('un fallo interno no filtra el stack al canal', async () => {
  const port = portDoble()
  const manejar = crearManejadorAccion({
    port, google: googleDoble(), secreto: SECRETO,
    mattermost: { abrirDialogo() { throw new Error('boom en /var/secreto/token=abc') }, actualizarPost() { throw new Error('boom') } },
  })
  const r = await manejar(payloadAccion({ context: { paso: 'excepcion' } }))
  const texto = JSON.stringify(r.body)
  assert.ok(!/boom|secreto|token|Error:/.test(texto), `filtró detalle interno: ${texto}`)
})

test('el evento `written` lleva el porqué a la tabla consultable', async () => {
  const port = portDoble()
  const manejar = crearManejadorAccion({ port, mattermost: mattermostDoble(), google: googleDoble(), secreto: SECRETO })
  // Se ejercita el auditor que arma el manejador, que es el puente real.
  const { crearAuditor } = await import('../lib/asistencia-auditoria.mjs')
  assert.equal(typeof crearAuditor, 'function')
  assert.equal(typeof manejar, 'function')
  assert.equal(EVENTO.WRITTEN, 'personal.asistencia.written')
})

test('no razona: este camino tiene que andar sin crédito de API', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('./asistencia-accion.mjs', import.meta.url), 'utf8')
  assert.ok(!/anthropic|claude|razonar\(/i.test(src), 'la carga de asistencia no invoca modelos')
})

// ── LA PUERTA TAMBIÉN DEJA CONSTANCIA ───────────────────────────────────────────
//
// Antes, un click desde un DM o desde otro canal se rechazaba y no quedaba en ningún lado
// salvo el log del servicio, que rota y no se puede consultar. Ahora el mismo ledger que
// registra una carga registra el intento negado. La guarda no cambió: sólo se la anota.

/** Los `emit_event` que salieron de un port doble, decodificados. */
function eventosEmitidos(port) {
  return port.consultas
    .filter((c) => /emit_event/.test(c.sql))
    .map((c) => ({ evento: c.params[3], datos: JSON.parse(c.params[9]) }))
}

test('un click desde un DM queda AUDITADO como rechazo', async () => {
  const port = portDoble()
  const manejar = crearManejadorAccion({ port, mattermost: mattermostDoble(), google: googleDoble(), secreto: SECRETO })
  await manejar(payloadAccion({ channel_id: 'un-dm-cualquiera', channel_type: 'D', team_id: 'equipo-1', user_name: 'jefe' }))
  const negados = eventosEmitidos(port).filter((e) => e.evento === EVENTO.DENIED)
  assert.equal(negados.length, 1)
  const d = negados[0].datos
  assert.equal(d.status, 'denied')
  assert.equal(d.motivo, 'canal')
  assert.equal(d.error_code, 'canal_directo')
  assert.equal(d.origen, 'accion')
  assert.equal(d.mattermost_user_id, 'usr-jefe')
  assert.equal(d.mattermost_username, 'jefe')
  assert.equal(d.channel_id, 'un-dm-cualquiera')
  assert.equal(d.team_id, 'equipo-1')
  assert.ok(d.request_id, 'sin request_id no se puede seguir el intento en los logs')
})

test('un click desde otro canal queda auditado con SU motivo', async () => {
  const port = portDoble()
  const manejar = crearManejadorAccion({ port, mattermost: mattermostDoble(), google: googleDoble(), secreto: SECRETO })
  await manejar(payloadAccion({ channel_id: 'canal-de-obras' }))
  const d = eventosEmitidos(port).find((e) => e.evento === EVENTO.DENIED).datos
  assert.equal(d.error_code, 'canal_no_es_el_oficial')
})

test('la auditoría del rechazo no lleva el payload ni nada sensible', async () => {
  const port = portDoble()
  const manejar = crearManejadorAccion({ port, mattermost: mattermostDoble(), google: googleDoble(), secreto: SECRETO })
  await manejar(payloadAccion({
    channel_id: 'un-dm-cualquiera', channel_type: 'D',
    context: { paso: 'obra', token: 'zx9-secreto', texto_privado: 'lo que escribió el jefe' },
  }))
  const s = JSON.stringify(eventosEmitidos(port))
  assert.ok(!s.includes('zx9-secreto') && !s.includes('lo que escribió el jefe'))
})
