// EL "NO TENGO ACCESO" TIENE QUE SER ACCIONABLE.
//
// Mandaba a «Entrá a "Conectar con Google" en el OS» — una pantalla que no existe en `src/app`.
// La persona no tenía forma de destrabarse sola y la capacidad quedaba muerta para siempre. Esto
// falló de verdad el 03 y 04/08/2026 con el calendario del dueño.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  invitacionAAutorizar, msgSinAcceso, errorSinCuenta, errorCuentaAjena, CONFIG_REQUERIDA,
} from './google-cliente.mjs'

const authUrlFalso = () => 'https://accounts.google.com/o/oauth2/v2/auth?client_id=X&scope=Y'

test('la invitación trae el LINK, no el nombre de un botón', () => {
  const t = invitacionAAutorizar({ authUrl: authUrlFalso })
  assert.match(t, /^https?:|\shttps?:\/\//, 'no hay una URL en el texto')
  assert.ok(t.includes('accounts.google.com'), 'la URL no es la de consentimiento de Google')
})

test('ningún mensaje de falta de acceso manda a "Conectar con Google"', () => {
  const textos = [
    msgSinAcceso({ authUrl: authUrlFalso }),
    errorSinCuenta().mensaje ?? errorSinCuenta().texto ?? '',
    errorCuentaAjena(null).mensaje ?? errorCuentaAjena(null).texto ?? '',
  ]
  for (const t of textos) {
    assert.doesNotMatch(String(t), /Conectar con Google/i,
      `sigue mandando a una pantalla inexistente: "${String(t).slice(0, 90)}"`)
  }
})

test('sin la config de OAuth NO se inventa un link: se dice qué falta', () => {
  const romper = () => { throw new Error('falta GOOGLE_OAUTH_CLIENT_ID/SECRET') }
  const t = invitacionAAutorizar({ authUrl: romper })
  assert.doesNotMatch(t, /https?:\/\//, 'armó una URL con la config rota')
  for (const clave of CONFIG_REQUERIDA) assert.ok(t.includes(clave), `no nombra ${clave}`)
})
