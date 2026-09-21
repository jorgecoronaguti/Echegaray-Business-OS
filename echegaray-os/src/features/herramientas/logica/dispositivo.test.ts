import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esTelefono } from './dispositivo.ts'

test('la cámara del teléfono abre la ficha de campo; la computadora, la de escritorio', () => {
  assert.equal(esTelefono('Mozilla/5.0 (Linux; Android 13; SM-A135M) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36'), true)
  assert.equal(esTelefono('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'), true)
  assert.equal(esTelefono('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36'), false)
  assert.equal(esTelefono('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15'), false)
  assert.equal(esTelefono(''), false, 'sin user-agent: escritorio')
})
