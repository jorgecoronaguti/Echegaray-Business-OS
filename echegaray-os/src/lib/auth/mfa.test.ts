import { test } from 'node:test'
import assert from 'node:assert/strict'
import { codigoTotp, leerExigeDosPasos, necesitaSegundoPaso, sellarExigeDosPasos } from './mfa.ts'

const SECRETO = 'secreto-de-prueba-no-es-el-de-produccion'
const UID = '11111111-2222-3333-4444-555555555555'

test('una sesión aal1 de una cuenta con dos pasos va al código; una aal2 no; sin dato no se bloquea a nadie', () => {
  assert.equal(necesitaSegundoPaso('aal1', 'si'), true)
  assert.equal(necesitaSegundoPaso(undefined, 'si'), true)
  assert.equal(necesitaSegundoPaso('aal2', 'si'), false)
  assert.equal(necesitaSegundoPaso('aal1', 'no'), false)
  assert.equal(necesitaSegundoPaso('aal1', null), false)
})

test('la cookie sellada dice si exige dos pasos, atada al usuario', async () => {
  const c = await sellarExigeDosPasos(UID, 'si', SECRETO)
  assert.equal(await leerExigeDosPasos(c, UID, SECRETO), 'si')
  assert.equal(await leerExigeDosPasos(c, 'otro', SECRETO), null)
  assert.equal(await leerExigeDosPasos(c.replace('si.', 'no.'), UID, SECRETO), null, 'cambiar el valor sin refirmar no vale')
})

test('el código son seis dígitos, con o sin espacios', () => {
  assert.equal(codigoTotp('123 456'), '123456')
  assert.equal(codigoTotp(' 000000 '), '000000')
  assert.equal(codigoTotp('12345'), null)
  assert.equal(codigoTotp('abcdef'), null)
  assert.equal(codigoTotp(null), null)
})
