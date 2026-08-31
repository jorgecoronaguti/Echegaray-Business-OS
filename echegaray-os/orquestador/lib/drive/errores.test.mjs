// Los errores de Drive tienen que ACUSAR AL CULPABLE CORRECTO. Hermético: 0 red.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CODIGO, DriveError, clasificar, esReintentable, statusDe, conDrive } from './errores.mjs'

const conStatus = (status, mensaje = 'boom') => Object.assign(new Error(mensaje), { status })

test('NINGÚN código nombra al OS: Drive caído nunca puede leerse como XSAS caído', () => {
  for (const c of Object.values(CODIGO)) {
    assert.ok(!/XSAS|ORQ|OS_/i.test(c), `el código ${c} nombra al OS`)
  }
  assert.ok(Object.values(CODIGO).includes('DRIVE_UNAVAILABLE'))
})

test('la caída de Google es DRIVE_UNAVAILABLE, venga como 5xx, 429, red o timeout', () => {
  assert.equal(clasificar(conStatus(503)).codigo, CODIGO.DRIVE_UNAVAILABLE)
  assert.equal(clasificar(conStatus(500)).codigo, CODIGO.DRIVE_UNAVAILABLE)
  assert.equal(clasificar(conStatus(429)).codigo, CODIGO.DRIVE_UNAVAILABLE)
  assert.equal(clasificar(new Error('fetch failed')).codigo, CODIGO.DRIVE_UNAVAILABLE)
  assert.equal(clasificar(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })).codigo, CODIGO.DRIVE_UNAVAILABLE)
  // El abort que le pone makeGoogleClient a cada llamada (ORQ_GOOGLE_FETCH_TIMEOUT_MS).
  assert.equal(clasificar(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })).codigo, CODIGO.DRIVE_UNAVAILABLE)
})

test('sólo lo transitorio se reintenta', () => {
  assert.equal(esReintentable(CODIGO.DRIVE_UNAVAILABLE), true)
  for (const c of [CODIGO.FORBIDDEN, CODIGO.NOT_FOUND, CODIGO.VERIFY_FAILED, CODIGO.UNSUPPORTED_OPERATION, CODIGO.QUOTA]) {
    assert.equal(esReintentable(c), false, c)
  }
})

test('403 se parte en tres, porque cada uno se arregla distinto', () => {
  // Falta autorizar → hay algo que hacer.
  assert.equal(clasificar(conStatus(403, 'Request had insufficient authentication scopes')).codigo, CODIGO.PERMISSION_REQUIRED)
  // Sin cuota → el mensaje real que devuelve Drive cuando copia el service account.
  assert.equal(clasificar(conStatus(403, 'The user\'s storageQuota has been exceeded')).codigo, CODIGO.QUOTA)
  // La credencial está bien: el archivo no está compartido con el OS. Reautorizar no lo arregla,
  // lo arregla el dueño del archivo compartiéndolo — mandar a "autorizar" sería mandar al lugar
  // equivocado. Ojo: el mensaje real de Google contiene "insufficient", que es lo que hacía que
  // cayera en PERMISSION_REQUIRED.
  assert.equal(clasificar(conStatus(403, 'The user does not have sufficient permissions for file 1abc')).codigo, CODIGO.FORBIDDEN)
  assert.equal(clasificar(conStatus(403, 'insufficientFilePermissions')).codigo, CODIGO.FORBIDDEN)
  assert.equal(clasificar(conStatus(403, 'cannotModifyRestrictedItem')).codigo, CODIGO.FORBIDDEN)
})

test('401 y la credencial ausente piden autorización, no rechazan al actor', () => {
  assert.equal(clasificar(conStatus(401)).codigo, CODIGO.PERMISSION_REQUIRED)
  assert.equal(clasificar(new Error('invalid_grant: token expired')).codigo, CODIGO.PERMISSION_REQUIRED)
})

test('404 es NOT_FOUND y 400 es INVALID_ARGUMENT', () => {
  assert.equal(clasificar(conStatus(404)).codigo, CODIGO.NOT_FOUND)
  assert.equal(clasificar(new Error('File not found: abc')).codigo, CODIGO.NOT_FOUND)
  assert.equal(clasificar(conStatus(400, 'Invalid query')).codigo, CODIGO.INVALID_ARGUMENT)
})

test('un error que no se entiende NO se disfraza de "Drive caído"', () => {
  // Decir DRIVE_UNAVAILABLE acá mandaría a mirar Google cuando el problema es del OS.
  const e = clasificar(new Error('cannot read properties of undefined'))
  assert.notEqual(e.codigo, CODIGO.DRIVE_UNAVAILABLE)
  assert.equal(e.reintentable, false)
})

test('statusDe lo saca de .status o del mensaje que arma google.mjs', () => {
  assert.equal(statusDe(conStatus(429)), 429)
  assert.equal(statusDe(new Error('google upload 403: quota')), 403)
  assert.equal(statusDe(new Error('sin numero')), null)
})

test('clasificar dos veces no pierde el motivo original', () => {
  const uno = clasificar(conStatus(404))
  assert.equal(clasificar(uno), uno)
})

test('conDrive convierte cualquier explosión en un DriveError con código', async () => {
  await assert.rejects(
    () => conDrive('el archivo X', () => { throw conStatus(503) }),
    (e) => e instanceof DriveError && e.codigo === CODIGO.DRIVE_UNAVAILABLE,
  )
  assert.equal(await conDrive('x', async () => 42), 42)
})
