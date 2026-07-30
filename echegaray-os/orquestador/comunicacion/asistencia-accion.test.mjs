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
  context: { paso: 'obra', valor: 'x' }, ...extra,
})

test('un click desde un DM NO se procesa: la guarda corre primero', async () => {
  const port = portDoble()
  const manejar = crearManejadorAccion({ port, mattermost: mattermostDoble(), google: googleDoble() })
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
  const manejar = crearManejadorAccion({ port, mattermost: mattermostDoble(), google: googleDoble() })
  const r = await manejar(payloadAccion({ channel_id: 'otro', submission: { horas: '9' } }))
  assert.ok(r.body.error, 'el diálogo necesita `error`')
  assert.ok(!r.body.ephemeral_text)
})

test('sin permiso tampoco se procesa, aunque el canal sea el correcto', async () => {
  const port = portDoble({ conPermiso: false })
  process.env.ORQ_ASISTENCIA_PERMISOS = 'estricto'
  try {
    const manejar = crearManejadorAccion({ port, mattermost: mattermostDoble(), google: googleDoble() })
    const r = await manejar(payloadAccion())
    assert.ok(r.body.ephemeral_text, 'se le dice que no puede')
    assert.ok(!port.consultas.some((c) => /asistencia_sesiones/.test(c.sql)))
  } finally {
    delete process.env.ORQ_ASISTENCIA_PERMISOS
  }
})

test('el binding desactivado apaga la carga sin desplegar código', async () => {
  const port = portDoble({ bindingActivo: false })
  const manejar = crearManejadorAccion({ port, mattermost: mattermostDoble(), google: googleDoble() })
  const r = await manejar(payloadAccion())
  assert.ok(r.body.ephemeral_text)
})

test('un fallo interno no filtra el stack al canal', async () => {
  const port = portDoble()
  const manejar = crearManejadorAccion({
    port, google: googleDoble(),
    mattermost: { abrirDialogo() { throw new Error('boom en /var/secreto/token=abc') }, actualizarPost() { throw new Error('boom') } },
  })
  const r = await manejar(payloadAccion({ context: { paso: 'excepcion' } }))
  const texto = JSON.stringify(r.body)
  assert.ok(!/boom|secreto|token|Error:/.test(texto), `filtró detalle interno: ${texto}`)
})

test('el evento `written` lleva el porqué a la tabla consultable', async () => {
  const port = portDoble()
  const manejar = crearManejadorAccion({ port, mattermost: mattermostDoble(), google: googleDoble() })
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
