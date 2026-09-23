import test from 'node:test'
import assert from 'node:assert/strict'
import { VERSIONES_DE_CUENTA, otraCaraDe } from './cuentaPropia.ts'

test('cada parte de la cuenta tiene exactamente dos caras con el mismo nombre', () => {
  for (const [parte, v] of Object.entries(VERSIONES_DE_CUENTA)) {
    assert.equal(v.escritorio, `/mi-cuenta/${parte}`)
    assert.equal(v.telefono, `/mi-informacion/${parte}`)
    assert.ok(v.titulo.startsWith('Mi'), `${parte}: el título no es «Mi…»`)
  }
})

test('de una cara se llega a la otra, y una ruta sin par no inventa una', () => {
  assert.deepEqual(otraCaraDe('/mi-cuenta/horas'), { href: '/mi-informacion/horas', dispositivo: 'telefono' })
  assert.deepEqual(otraCaraDe('/mi-informacion/documentos?ver=todos'), { href: '/mi-cuenta/documentos', dispositivo: 'escritorio' })
  assert.deepEqual(otraCaraDe('/mi-informacion/legajo/'), { href: '/mi-cuenta/legajo', dispositivo: 'escritorio' })
  assert.equal(otraCaraDe('/mi-cuenta'), null, 'el perfil no tiene versión de teléfono: `/mi-informacion` es «Yo», otra pantalla')
  assert.equal(otraCaraDe('/mi-informacion/recibos'), null)
  assert.equal(otraCaraDe('/mi-cuenta/seguridad'), null)
})
