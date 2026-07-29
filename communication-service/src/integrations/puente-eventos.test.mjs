// Tests del puente con orq.events (M10). Herméticos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aEventoOrq, PuenteMemoria, PuenteOrqEvents, SUBJECT_COMUNICACION } from './puente-eventos.mjs'
import { construirEvento, TIPOS } from '../core/eventos-canonicos.mjs'

function entrante() {
  return construirEvento({
    type: TIPOS.MENSAJE_RECIBIDO,
    idempotency_key: 'p1',
    actor: { tipo: 'persona', id: 'u1', display: 'rodrigo' },
    data: { channel_id: 'c1', post_id: 'p1', texto: 'hola' },
  })
}

test('aEventoOrq preserva correlation/causation y expone comm_event_id (dedup end-to-end)', () => {
  const ev = entrante()
  const orq = aEventoOrq(ev)
  assert.equal(orq.subject_type, SUBJECT_COMUNICACION)
  assert.equal(orq.type, 'comunicacion.mensaje.recibido')
  assert.equal(orq.correlation_id, ev.correlation_id)
  assert.equal(orq.causation_id, ev.id, 'el evento de comunicación causa el del OS')
  assert.equal(orq.payload.comm_event_id, ev.id)
})

test('PuenteMemoria publica hacia el OS y deduplica por comm_event_id', async () => {
  const puente = new PuenteMemoria()
  const ev = entrante()
  const r1 = await puente.publicarHaciaOS(ev)
  assert.equal(r1.ok, true)
  assert.equal(puente.publicados.length, 1)
  const r2 = await puente.publicarHaciaOS(ev) // replay del mismo comm event
  assert.equal(r2.ok, true)
  assert.equal(r2.duplicado, true)
  assert.equal(puente.publicados.length, 1, 'no duplica el trabajo del OS')
})

test('PuenteMemoria puede simular caída del OS (reintentable)', async () => {
  const puente = new PuenteMemoria()
  puente.fallarCon(1)
  const r = await puente.publicarHaciaOS(entrante())
  assert.equal(r.ok, false)
  assert.equal(r.reintentable, true)
})

test('PuenteOrqEvents inyecta emitEvent (no importa el orquestador) y traduce', async () => {
  const llamadas = []
  const puente = new PuenteOrqEvents({ emitEvent: async (params) => { llamadas.push(params); return 42 } })
  const r = await puente.publicarHaciaOS(entrante())
  assert.equal(r.ok, true)
  assert.equal(r.ref, 42)
  assert.equal(llamadas[0].type, 'comunicacion.mensaje.recibido')
})

test('PuenteOrqEvents exige emitEvent inyectado (falla cerrado si falta)', () => {
  assert.throws(() => new PuenteOrqEvents({}), /falta emitEvent/)
})

test('PuenteOrqEvents convierte una excepción del OS en fallo reintentable', async () => {
  const puente = new PuenteOrqEvents({ emitEvent: async () => { throw new Error('db down') } })
  const r = await puente.publicarHaciaOS(entrante())
  assert.equal(r.ok, false)
  assert.equal(r.reintentable, true)
})
