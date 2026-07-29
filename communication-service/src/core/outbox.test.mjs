// Tests de la política de reintentos/DLQ (pura). Herméticos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidirProximo, backoffMs, ESTADO, MAX_INTENTOS } from './outbox.mjs'

test('backoff es exponencial con techo', () => {
  assert.equal(backoffMs(1), 1000)
  assert.equal(backoffMs(2), 2000)
  assert.equal(backoffMs(3), 4000)
  assert.equal(backoffMs(50), 5 * 60_000, 'no supera el techo de 5 min')
})

test('éxito ⇒ publicado (terminal feliz) con platform_ref', () => {
  const next = decidirProximo({ intentos: 0 }, { ok: true, platform_ref: 'post_1' })
  assert.equal(next.estado, ESTADO.PUBLICADO)
  assert.equal(next.platform_ref, 'post_1')
  assert.equal(next.a_dlq, false)
  assert.equal(next.next_attempt_at, null)
})

test('error reintentable ⇒ pendiente con next_attempt_at en el futuro', () => {
  const ahora = 1_000_000
  const next = decidirProximo({ intentos: 1 }, { ok: false, error: '503', reintentable: true }, ahora)
  assert.equal(next.estado, ESTADO.PENDIENTE)
  assert.equal(next.intentos, 2)
  assert.equal(next.next_attempt_at, ahora + backoffMs(2))
  assert.equal(next.a_dlq, false)
})

test('error permanente (4xx) ⇒ dead directo, sin agotar reintentos', () => {
  const next = decidirProximo({ intentos: 0 }, { ok: false, error: '400 bad channel', reintentable: false })
  assert.equal(next.estado, ESTADO.DEAD)
  assert.equal(next.a_dlq, true)
  assert.match(next.last_error, /400/)
})

test('agotar MAX_INTENTOS ⇒ dead aunque el error sea reintentable', () => {
  const next = decidirProximo({ intentos: MAX_INTENTOS - 1 }, { ok: false, error: '503', reintentable: true })
  assert.equal(next.intentos, MAX_INTENTOS)
  assert.equal(next.estado, ESTADO.DEAD)
  assert.equal(next.a_dlq, true)
})
