import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sumarTranscript } from './medir-tokens.mjs'

const vuelta = (id, model, u, timestamp = '2026-09-26T20:00:00Z') => JSON.stringify({ type: 'assistant', timestamp, message: { id, model, usage: u } })

test('suma input + cache como contexto, cuenta la salida aparte y separa por modelo', () => {
  const t = [
    vuelta('a', 'claude-opus-5-5', { input_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 90, output_tokens: 5 }),
    vuelta('b', 'claude-sonnet-5', { input_tokens: 0, cache_read_input_tokens: 500, output_tokens: 7 }),
    JSON.stringify({ type: 'user', message: { content: 'hola' } }),
  ].join('\n')
  const r = sumarTranscript(t)
  assert.equal(r.vueltas, 2); assert.equal(r.entrada, 1600); assert.equal(r.salida, 12); assert.equal(r.maxCtx, 1100)
  assert.deepEqual(r.porModelo, { 'opus-5-5': 1100, 'sonnet-5': 500 })
})

test('una respuesta partida en varias líneas con el mismo id se cuenta una sola vez', () => {
  const u = { input_tokens: 1, cache_read_input_tokens: 99, output_tokens: 3 }
  const r = sumarTranscript([vuelta('x', 'm', u), vuelta('x', 'm', u)].join('\n'))
  assert.equal(r.vueltas, 1); assert.equal(r.entrada, 100)
})

test('--desde deja afuera las vueltas anteriores y una línea rota no tumba la suma', () => {
  const u = { input_tokens: 100, output_tokens: 1 }
  const r = sumarTranscript([vuelta('v', 'm', u, '2026-09-26T10:00:00Z'), '{roto', vuelta('n', 'm', u, '2026-09-26T21:00:00Z')].join('\n'), { desde: '2026-09-26T20:00:00.000Z' })
  assert.equal(r.vueltas, 1)
})

test('mismo id con salida creciente y líneas en cero: gana el máximo de cada campo (no la primera línea)', () => {
  const r = sumarTranscript([
    vuelta('x', 'm', { input_tokens: 2, cache_read_input_tokens: 1000, cache_creation_input_tokens: 50, output_tokens: 10 }),
    vuelta('x', 'm', { input_tokens: 2, cache_read_input_tokens: 1000, cache_creation_input_tokens: 50, output_tokens: 400 }),
    vuelta('x', 'm', { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 }),
  ].join('\n'))
  assert.equal(r.vueltas, 1); assert.equal(r.salida, 400); assert.equal(r.entrada, 1052)
  assert.equal(r.nueva, 2); assert.equal(r.cacheLectura, 1000); assert.equal(r.cacheEscritura, 50)
})

test('una respuesta ya contada en otro transcript (vistos compartido) no se suma dos veces', () => {
  const vistos = new Set()
  const t = vuelta('dup', 'm', { input_tokens: 5, output_tokens: 1 })
  assert.equal(sumarTranscript(t, { vistos }).vueltas, 1)
  assert.equal(sumarTranscript(t, { vistos }).vueltas, 0)
})
