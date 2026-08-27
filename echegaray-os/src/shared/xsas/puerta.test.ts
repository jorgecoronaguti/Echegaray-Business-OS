import test from 'node:test'
import assert from 'node:assert/strict'
import { urlDePuerta } from './puerta'

test('la ruta /xsas se pega a la base del túnel sin duplicar la barra', () => {
  assert.equal(urlDePuerta('https://algo.trycloudflare.com'), 'https://algo.trycloudflare.com/xsas')
  assert.equal(urlDePuerta('https://algo.trycloudflare.com/'), 'https://algo.trycloudflare.com/xsas')
  assert.equal(urlDePuerta('https://algo.trycloudflare.com///'), 'https://algo.trycloudflare.com/xsas')
})

test('la ruta se puede cambiar sin tocar la base', () => {
  assert.equal(urlDePuerta('https://x.com', '/otra'), 'https://x.com/otra')
})
