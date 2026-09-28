import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scheduledDirectiveHandler, herramientasDeAgenda, textoDeResultado } from './scheduled_directive.mjs'

const ctx = { logger: { info() {} }, config: {} }
const correr = async (inputs, herramientas) => {
  const guardado = []
  const r = await scheduledDirectiveHandler({ inputs }, ctx, { google: null, herramientas, guardar: async (id, t) => guardado.push([id, t]) })
  return { r, guardado }
}

test('corre la herramienta nombrada, sin modelo, y guarda su texto', async () => {
  let recibio
  const h = new Map([['briefing_caja', { run: async (e) => { recibio = e; return { texto: 'caja hoy $1' } } }]])
  const { r, guardado } = await correr({ schedule_id: 's1', herramienta: 'briefing_caja', entrada: { a: 1 } }, h)
  assert.deepEqual(recibio, { a: 1 })
  assert.deepEqual(guardado, [['s1', 'caja hoy $1']])
  assert.equal(r.result.herramienta, 'briefing_caja')
})

test('sin herramienta no corre nada y lo deja escrito', async () => {
  const { guardado } = await correr({ schedule_id: 's2', directive: 'dame el briefing' }, new Map())
  assert.match(guardado[0][1], /no corrió/)
})

test('una herramienta que no está habilitada no corre', async () => {
  const { guardado } = await correr({ schedule_id: 's3', herramienta: 'sincronizar_nomina' }, new Map())
  assert.match(guardado[0][1], /no es una herramienta de lectura habilitada/)
})

test('el error de la herramienta queda como error, no como éxito', async () => {
  const h = new Map([['x', { run: async () => ({ error: 'DDJJ: no encontré la carpeta' }) }]])
  const { guardado } = await correr({ schedule_id: 's4', herramienta: 'x' }, h)
  assert.equal(guardado[0][1], 'error: DDJJ: no encontré la carpeta')
})

test('la agenda sólo habilita herramientas de lectura', () => {
  const m = herramientasDeAgenda(null)
  assert.deepEqual([...m.keys()].sort(), ['alias_pendientes', 'briefing_caja', 'indices_economicos'])
  for (const d of m.values()) assert.equal(d.capability, 'drive.read')
})

test('textoDeResultado prefiere texto, después resumen', () => {
  assert.equal(textoDeResultado({ texto: 'a', resumen: 'b' }), 'a')
  assert.equal(textoDeResultado({ resumen: 'b' }), 'b')
  assert.equal(textoDeResultado(null), '(sin respuesta)')
})

test('no se puede crear una recurrencia sin herramienta propia', async () => {
  const { createSchedule } = await import('../lib/schedules.mjs')
  await assert.rejects(createSchedule({ title: 't', directive: 'revisá cobranzas', cadence: 'daily:08:00' }), /sólo corre herramientas propias/)
  await assert.rejects(createSchedule({ title: 't', cadence: 'daily:08:00', herramienta: 'sincronizar_nomina' }), /no es una/)
})
