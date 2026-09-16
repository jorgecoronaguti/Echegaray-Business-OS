import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esAccionDeOtraVersion, hayVersionNueva, puedeRecargar, RECARGA_MINIMA_MS } from './version.ts'

test('versión publicada distinta de la de la pestaña: hay que recargar', () => {
  assert.equal(hayVersionNueva('dpl_A', 'dpl_B'), true)
  assert.equal(hayVersionNueva('dpl_A', 'dpl_A'), false)
  assert.equal(hayVersionNueva('dpl_A', null), false, 'sin respuesta no se recarga a ciegas')
  assert.equal(hayVersionNueva('local', 'dpl_B'), false, 'en desarrollo no hay versión que comparar')
})

test('el error real de producción (16/09/2026) se reconoce como pestaña de otra versión', () => {
  const real = Object.assign(new Error('Server Action "40a6e04c88f009a39b9b899a2c3106fb5cfed4836f" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action'), { name: 'UnrecognizedActionError' })
  assert.equal(esAccionDeOtraVersion(real), true)
  assert.equal(esAccionDeOtraVersion({ message: 'Server Action "x" was not found on the server.' }), true)
  assert.equal(esAccionDeOtraVersion(new Error('canceling statement due to statement timeout')), false)
  assert.equal(esAccionDeOtraVersion(null), false)
})

test('no hay bucle de recargas', () => {
  assert.equal(puedeRecargar(null, 1000), true)
  assert.equal(puedeRecargar(1000, 1000 + RECARGA_MINIMA_MS - 1), false)
  assert.equal(puedeRecargar(1000, 1000 + RECARGA_MINIMA_MS), true)
})
