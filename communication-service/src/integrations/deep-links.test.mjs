// Tests de deep links al OS. Herméticos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deepLink, esEnlazable, RECURSOS } from './deep-links.mjs'

test('construye un link absoluto al dominio oficial del OS', () => {
  const url = deepLink('obra', 'estrella')
  assert.match(url, /^https:\/\/app\.ecsas\.com\.ar\/control-obras\/estrella$/)
})

test('escapa el identificador', () => {
  const url = deepLink('accion', 'a/b c')
  assert.match(url, /a%2Fb%20c/)
})

test('permite override del dominio (staging/local)', () => {
  const url = deepLink('flujo_caja', undefined, 'http://localhost:3000')
  assert.equal(url, 'http://localhost:3000/finanzas/flujo-caja')
})

test('un recurso desconocido falla ruidoso (no genera un link roto)', () => {
  assert.throws(() => deepLink('inexistente', 'x'), /recurso desconocido/)
})

test('esEnlazable refleja el catálogo', () => {
  assert.equal(esEnlazable('obra'), true)
  assert.equal(esEnlazable('inexistente'), false)
  assert.ok(RECURSOS.includes('cobranza'))
})
