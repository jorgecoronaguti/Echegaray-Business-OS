import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pareceTelefono, pareceTelefonoSegun } from './dispositivo.ts'

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const CHROME_ESCRITORIO = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

test('un teléfono Chromium se reconoce por sec-ch-ua-mobile', () => {
  assert.equal(pareceTelefono('?1', CHROME_ANDROID), true)
})

test('un iPhone se reconoce SIN client hints — Safari no manda sec-ch-ua-mobile', () => {
  assert.equal(pareceTelefono(null, SAFARI_IPHONE), true)
})

test('el escritorio no es teléfono, y sin ninguna pista tampoco', () => {
  assert.equal(pareceTelefono('?0', CHROME_ESCRITORIO), false)
  assert.equal(pareceTelefono(null, CHROME_ESCRITORIO), false)
  assert.equal(pareceTelefono(null, null), false)
})

test('sec-ch-ua-mobile le gana al User-Agent: ?0 con un UA de teléfono NO es teléfono', () => {
  assert.equal(pareceTelefono('?0', SAFARI_IPHONE), false)
})

test('leer los encabezados es la misma pregunta; sin encabezados es escritorio', () => {
  const h = new Headers({ 'user-agent': SAFARI_IPHONE })
  assert.equal(pareceTelefonoSegun(h), true)
  assert.equal(pareceTelefonoSegun(new Headers({ 'sec-ch-ua-mobile': '?0', 'user-agent': SAFARI_IPHONE })), false)
  assert.equal(pareceTelefonoSegun(null), false)
})
