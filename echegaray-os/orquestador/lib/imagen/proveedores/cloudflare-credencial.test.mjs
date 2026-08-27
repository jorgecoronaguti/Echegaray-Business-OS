import test from 'node:test'
import assert from 'node:assert/strict'
import { leerToml, rutasDeConfig, tokenCloudflare, vencido } from './cloudflare-credencial.mjs'

test('lee las tres claves del toml de Wrangler y nada más', () => {
  const t = leerToml('oauth_token = "AAA"\nexpiration_time = "2026-08-27T18:00:00.000Z"\nrefresh_token = "BBB"\nscopes = [ "a" ]\n')
  assert.deepEqual(t, { oauth_token: 'AAA', refresh_token: 'BBB', expiration_time: '2026-08-27T18:00:00.000Z' })
})

test('un toml sin token no rompe: devuelve nulos', () => {
  assert.deepEqual(leerToml('scopes = [ ]'), { oauth_token: null, refresh_token: null, expiration_time: null })
})

test('vencer es con un minuto de colchón: un token que muere en 30 s ya se considera vencido', () => {
  const ahora = new Date('2026-08-27T18:00:00Z')
  assert.equal(vencido('2026-08-27T18:00:30.000Z', ahora), true)
  assert.equal(vencido('2026-08-27T18:05:00.000Z', ahora), false)
  assert.equal(vencido(null, ahora), true)
  assert.equal(vencido('no es una fecha', ahora), true)
})

test('el token del entorno GANA — no se toca el disco ni la red', async () => {
  const prev = process.env.CLOUDFLARE_API_TOKEN
  process.env.CLOUDFLARE_API_TOKEN = '  del-entorno  '
  let pedidos = 0
  try {
    assert.equal(await tokenCloudflare({ fetchImpl: async () => { pedidos++; return { ok: false } } }), 'del-entorno')
    assert.equal(pedidos, 0)
  } finally {
    if (prev === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = prev
  }
})

test('se busca en los dos lugares donde Wrangler deja su configuración', () => {
  const r = rutasDeConfig('/casa')
  assert.deepEqual(r, ['/casa/.config/.wrangler/config/default.toml', '/casa/.wrangler/config/default.toml'])
})
