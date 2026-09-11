import assert from 'node:assert/strict'
import { test } from 'node:test'
import { esFallaDeBackend, fetchConTope } from './fetch-con-tope.ts'

test('un backend que no contesta se corta al tope, no espera para siempre', async () => {
  // Un fetch que sólo termina cuando lo abortan: es lo que hizo Supabase el 11/09/2026.
  const colgado: typeof fetch = (_e, init) => new Promise((_res, rej) => {
    init?.signal?.addEventListener('abort', () => rej(init.signal!.reason))
  })
  const f = fetchConTope(30, colgado)
  const t0 = Date.now()
  await assert.rejects(f('https://x.invalid/auth/v1/user'), (e: Error) => e.name === 'TimeoutError')
  assert.ok(Date.now() - t0 < 1_000, 'rechazó por el tope, no por otra cosa')
})

test('un backend sano pasa intacto, con su respuesta', async () => {
  const sano: typeof fetch = async () => new Response('ok', { status: 200 })
  const r = await fetchConTope(1_000, sano)('https://x.invalid/')
  assert.equal(r.status, 200)
})

test('la falla de backend se reconoce por nombre, mensaje o causa; el resto no', () => {
  assert.equal(esFallaDeBackend(Object.assign(new Error('x'), { name: 'TimeoutError' })), true)
  assert.equal(esFallaDeBackend(new TypeError('fetch failed')), true)
  assert.equal(esFallaDeBackend(Object.assign(new Error('x'), { cause: { code: 'ECONNRESET' } })), true)
  assert.equal(esFallaDeBackend(new Error('permission denied for table perfiles')), false)
  assert.equal(esFallaDeBackend(null), false)
})
