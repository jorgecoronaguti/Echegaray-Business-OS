import test from 'node:test'
import assert from 'node:assert/strict'
import { apagaElRazonador, clasificarError, clasificarRespuesta, clasificarStatus } from './clasificar-error.mjs'

test('sin saldo es «credit», no se reintenta y apaga el razonador', () => {
  assert.deepEqual(clasificarStatus(402), { kind: 'credit', hard: true, status: 402, reintentable: false })
  // Anthropic también lo manda como 400 con el motivo en el cuerpo.
  const c = clasificarStatus(400, 'Your credit balance is too low to access the API')
  assert.equal(c.kind, 'credit')
  assert.ok(apagaElRazonador(c))
})

test('un 429 NO es una caída: se reintenta y NO apaga nada', () => {
  const c = clasificarStatus(429)
  assert.equal(c.kind, 'rate_limit')
  assert.ok(c.reintentable)
  assert.ok(!c.hard)
  assert.ok(!apagaElRazonador(c))
})

test('un 5xx del proveedor se reintenta y tampoco degrada el OS', () => {
  for (const s of [500, 502, 503, 529]) {
    const c = clasificarStatus(s)
    assert.equal(c.kind, 'server', String(s))
    assert.ok(c.reintentable, String(s))
    assert.ok(!apagaElRazonador(c), String(s))
  }
})

test('UN BUG NUESTRO no se reintenta — reintentar lo esconde', () => {
  // Un 400 sin mensaje de saldo somos nosotros mandando algo mal.
  const c = clasificarStatus(400, 'messages.0.content: expected array')
  assert.equal(c.kind, 'client')
  assert.ok(!c.reintentable)
  assert.equal(clasificarStatus(404).reintentable, false)
  assert.equal(clasificarStatus(422).reintentable, false)
})

test('la credencial vencida apaga el razonador pero la falta de permiso no', () => {
  assert.ok(apagaElRazonador(clasificarStatus(401)))
  // 403 es un modelo o una feature que la cuenta no tiene: no se arregla esperando ni degradando.
  assert.equal(clasificarStatus(403).kind, 'permission')
  assert.ok(!apagaElRazonador(clasificarStatus(403)))
})

test('un fallo de red se reconoce sin status y se reintenta', () => {
  for (const err of [
    { name: 'APIConnectionError' },
    { name: 'APIConnectionTimeoutError' },
    { name: 'AbortError' },
    new TypeError('fetch failed'),
    { message: 'ECONNRESET' },
    { message: 'getaddrinfo ENOTFOUND api.anthropic.com' },
  ]) {
    const c = clasificarError(err)
    assert.equal(c.kind, 'network', JSON.stringify(err.name ?? err.message))
    assert.ok(c.reintentable)
  }
})

test('el error del SDK y la respuesta de fetch dan la MISMA clasificación', () => {
  // Es todo el punto del módulo: cuatro caminos, dos formas de error, una sola tabla.
  assert.deepEqual(clasificarError({ status: 429 }), clasificarRespuesta(429))
  assert.deepEqual(
    clasificarError({ status: 400, message: 'credit balance too low' }),
    clasificarRespuesta(400, 'credit balance too low'),
  )
})

test('lo que no se entiende no se reintenta ni degrada', () => {
  const c = clasificarError({})
  assert.equal(c.kind, 'unknown')
  assert.ok(!c.reintentable)
  assert.ok(!apagaElRazonador(c))
})
