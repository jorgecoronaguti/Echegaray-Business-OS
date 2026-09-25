// El enlace personal del portal: 256 bits al azar, se guarda sólo el hash y la forma se valida antes
// de tocar la base. Ver `enlace.ts`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { enlaceDeIngreso, hashDeToken, nuevoToken, pareceToken } from './enlace.ts'

test('un token nuevo tiene 43 caracteres base64url y no se repite', () => {
  const a = nuevoToken()
  const b = nuevoToken()
  assert.equal(a.length, 43)
  assert.ok(pareceToken(a))
  assert.notEqual(a, b)
})

test('lo que se guarda es el hash, no el token', () => {
  const t = nuevoToken()
  const h = hashDeToken(t)
  assert.match(h, /^[0-9a-f]{64}$/)
  assert.notEqual(h, t)
  assert.equal(hashDeToken(t), h, 'el mismo token da el mismo hash')
})

test('un valor que no tiene forma de token no llega a la base', () => {
  for (const malo of [null, undefined, '', 'abc', 'x'.repeat(42), 'x'.repeat(44), `${'a'.repeat(42)}=`, "' or 1=1 --aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]) {
    assert.equal(pareceToken(malo as string), false, String(malo))
  }
})

test('el enlace apunta a la ruta de ingreso de la base del sitio', () => {
  assert.equal(enlaceDeIngreso('https://app.ecsas.com.ar/', 'T'.repeat(43)), `https://app.ecsas.com.ar/portal/ingresar?t=${'T'.repeat(43)}`)
})
