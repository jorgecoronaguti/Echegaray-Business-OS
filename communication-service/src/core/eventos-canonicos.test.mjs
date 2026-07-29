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

// ── M1 · Idempotencia por INTENCIÓN, no por contenido ──
test('M1: dos mensajes salientes idénticos con event_id distinto son DISTINTOS (los dos se envían)', () => {
  const a = construirEvento({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: 'c1', texto: 'recordatorio' } })
  const b = construirEvento({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: 'c1', texto: 'recordatorio' } })
  assert.notEqual(a.id, b.id)
  assert.notEqual(a.idempotency_key, b.idempotency_key, 'mismo contenido ya NO colisiona')
})

test('M1: reintentar el MISMO evento (mismo id) mantiene la misma clave (se deduplica)', () => {
  const ev = construirEvento({ type: TIPOS.MENSAJE_PUBLICAR, id: 'ev-fijo', data: { channel_id: 'c1', texto: 'x' } })
  const reintento = construirEvento({ type: TIPOS.MENSAJE_PUBLICAR, id: 'ev-fijo', data: { channel_id: 'c1', texto: 'x' } })
  assert.equal(ev.idempotency_key, reintento.idempotency_key)
})

test('M1: una clave de negocio explícita gana sobre todo', () => {
  const ev = construirEvento({ type: TIPOS.MENSAJE_PUBLICAR, idempotency_key: 'certif-4-aprobado', data: { channel_id: 'c1', texto: 'x' } })
  assert.equal(ev.idempotency_key, 'certif-4-aprobado')
})

test('M1: intent_id deriva una clave estable por intención', () => {
  const a = construirEvento({ type: TIPOS.MENSAJE_PUBLICAR, intent_id: 'aviso-caja-2026-07-29', data: { channel_id: 'c1', texto: 'x' } })
  const b = construirEvento({ type: TIPOS.MENSAJE_PUBLICAR, intent_id: 'aviso-caja-2026-07-29', data: { channel_id: 'c9', texto: 'otro texto' } })
  assert.equal(a.idempotency_key, 'intent:aviso-caja-2026-07-29')
  assert.equal(a.idempotency_key, b.idempotency_key, 'la misma intención colapsa aunque cambie el contenido')
})

test('M1: mensajes a canales distintos (mismo texto) son distintos', () => {
  const a = construirEvento({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: 'obras', texto: 'ok' } })
  const b = construirEvento({ type: TIPOS.MENSAJE_PUBLICAR, data: { channel_id: 'direccion', texto: 'ok' } })
  assert.notEqual(a.idempotency_key, b.idempotency_key)
})

test('claveIdempotencia (identidad natural entrante) es determinística', () => {
  const k1 = claveIdempotencia({ t: 'msg', post: 'p1' })
  const k2 = claveIdempotencia({ t: 'msg', post: 'p1' })
  const k3 = claveIdempotencia({ t: 'msg', post: 'p2' })
  assert.equal(k1, k2)
  assert.notEqual(k1, k3)
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
  const raiz = construirEvento({ type: TIPOS.MENSAJE_RECIBIDO, idempotency_key: 'p1', data: { post_id: 'p1', texto: 'x' } })
  const respuesta = construirEvento({
    type: TIPOS.MENSAJE_RESPONDER,
    data: { channel_id: 'c', texto: 'ok', root_id: 'p1' },
    correlation_id: raiz.correlation_id,
    causation_id: raiz.id,
  })
  assert.equal(respuesta.correlation_id, raiz.correlation_id)
  assert.equal(respuesta.causation_id, raiz.id)
})
