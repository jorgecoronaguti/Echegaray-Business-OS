// Tests del contrato canónico de eventos. Herméticos, 0 red, 0 DB.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  construirEvento, validarEvento, direccionDe, claveIdempotencia,
  TIPOS, DIRECCION, SCHEMA_VERSION,
} from './eventos-canonicos.mjs'

test('construir un evento saliente lo marca con dirección saliente y sobre completo', () => {
  const ev = construirEvento({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: 'c1', texto: 'hola' } })
  assert.equal(ev.schema_version, SCHEMA_VERSION)
  assert.equal(ev.type, TIPOS.MENSAJE_PUBLICAR)
  assert.equal(ev.direccion, DIRECCION.SALIENTE)
  assert.ok(ev.id)
  assert.ok(ev.idempotency_key)
  assert.equal(ev.correlation_id, ev.id, 'sin heredar, la raíz del hilo es su propio id')
  assert.ok(ev.occurred_at)
  assert.equal(ev.data.texto, 'hola')
})

test('un tipo entrante se marca como entrante', () => {
  assert.equal(direccionDe(TIPOS.MENSAJE_RECIBIDO), DIRECCION.ENTRANTE)
  assert.equal(direccionDe(TIPOS.COMANDO_INVOCADO), DIRECCION.ENTRANTE)
  assert.equal(direccionDe(TIPOS.MENSAJE_PUBLICAR), DIRECCION.SALIENTE)
})

test('idempotency_key es determinística e ignora campos volátiles', () => {
  const a = construirEvento({ type: TIPOS.MENSAJE_RECIBIDO, data: { post_id: 'p9', texto: 'hola', ruido: { x: Date.now() } } })
  const b = construirEvento({ type: TIPOS.MENSAJE_RECIBIDO, data: { post_id: 'p9', texto: 'hola', ruido: { x: Date.now() + 999 } } })
  assert.equal(a.idempotency_key, b.idempotency_key, 'el mismo hecho ⇒ la misma clave (objeto volátil no cuenta)')
})

test('la clave cambia si cambia un campo natural', () => {
  const k1 = claveIdempotencia({ type: 'x', post_id: '1' })
  const k2 = claveIdempotencia({ type: 'x', post_id: '2' })
  assert.notEqual(k1, k2)
})

test('un tipo desconocido no se puede construir', () => {
  assert.throws(() => construirEvento({ type: 'inexistente.hecho', data: {} }), /desconocido/)
})

test('data debe ser un objeto', () => {
  assert.throws(() => construirEvento({ type: TIPOS.MENSAJE_PUBLICAR, data: null }), /requiere un objeto data/)
  assert.throws(() => construirEvento({ type: TIPOS.MENSAJE_PUBLICAR, data: [] }), /requiere un objeto data/)
})

test('validarEvento acepta un evento bien formado y rechaza uno de versión futura', () => {
  const ev = construirEvento({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: 'c', texto: 't' } })
  assert.deepEqual(validarEvento(ev), { ok: true })
  const futuro = { ...ev, schema_version: SCHEMA_VERSION + 1 }
  assert.equal(validarEvento(futuro).ok, false)
})

test('validarEvento detecta dirección incoherente con el tipo (manipulación)', () => {
  const ev = construirEvento({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: 'c', texto: 't' } })
  const trucho = { ...ev, direccion: DIRECCION.ENTRANTE }
  const r = validarEvento(trucho)
  assert.equal(r.ok, false)
  assert.match(r.error, /direccion incoherente/)
})

test('el sobre es inmutable (freeze) — no se puede mutar data ni el evento', () => {
  const ev = construirEvento({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: 'c', texto: 't' } })
  assert.throws(() => { ev.type = 'otro' }, TypeError)
  assert.throws(() => { ev.data.texto = 'cambiado' }, TypeError)
})

test('un evento puede heredar correlation_id y causation_id (cadena causal auditable)', () => {
  const raiz = construirEvento({ type: TIPOS.MENSAJE_RECIBIDO, data: { post_id: 'p1', texto: 'x' } })
  const respuesta = construirEvento({
    type: TIPOS.MENSAJE_RESPONDER,
    data: { channel_id: 'c', texto: 'ok', root_id: 'p1' },
    correlation_id: raiz.correlation_id,
    causation_id: raiz.id,
  })
  assert.equal(respuesta.correlation_id, raiz.correlation_id)
  assert.equal(respuesta.causation_id, raiz.id)
})
