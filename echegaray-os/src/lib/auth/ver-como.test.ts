import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ROLES_MIRABLES, VIDA_VER_COMO_SEGUNDOS, esPeticionDeEscritura, esRolMirable, leerVerComo, sellarVerComo,
} from './ver-como.ts'

const SECRETO = 'secreto-de-prueba-no-es-el-de-produccion'
const UID = '11111111-2222-3333-4444-555555555555'
const OTRO = '99999999-8888-7777-6666-555555555555'

test('la lente que se selló se puede leer, y dice el rol mirado', async () => {
  const cookie = await sellarVerComo({ uid: UID, rol: 'jefe_obra' }, SECRETO)
  assert.equal(await leerVerComo(cookie, { uid: UID }, SECRETO), 'jefe_obra')
})

test('LA LENTE NO SIRVE PARA OTRO USUARIO: la cookie está atada al que la encendió', async () => {
  const cookie = await sellarVerComo({ uid: UID, rol: 'campo' }, SECRETO)
  assert.equal(await leerVerComo(cookie, { uid: OTRO }, SECRETO), null)
})

test('una firma que no cierra no es una lente', async () => {
  const cookie = await sellarVerComo({ uid: UID, rol: 'campo' }, SECRETO)
  assert.equal(await leerVerComo(cookie, { uid: UID }, 'otro-secreto'), null)
})

test('NO SE PUEDE REESCRIBIR EL ROL SIN REFIRMAR: cambiar `campo` por `direccion` invalida la cookie', async () => {
  const cookie = await sellarVerComo({ uid: UID, rol: 'campo' }, SECRETO)
  const falsa = cookie.replace('.campo.', '.direccion.')
  assert.equal(await leerVerComo(falsa, { uid: UID }, SECRETO), null)
})

test('vencida se ignora: la lente no sobrevive a la jornada', async () => {
  const ahora = Date.now()
  const cookie = await sellarVerComo({ uid: UID, rol: 'administracion', ahora }, SECRETO)
  const despues = ahora + (VIDA_VER_COMO_SEGUNDOS + 1) * 1000
  // Vigente todavía: la misma cookie, un segundo antes de vencer.
  assert.equal(await leerVerComo(cookie, { uid: UID, ahora }, SECRETO), 'administracion')
  assert.equal(await leerVerComo(cookie, { uid: UID, ahora: despues }, SECRETO), null)
})

test('una cookie de OTRO PROPÓSITO no vale como lente, aunque comparta el secreto', async () => {
  // El formato de `rol-cache` es `rol.uid.vence.firma`: cuatro partes, sin propósito. Ni siquiera
  // llega a compararse la firma — pero lo que importa es que no se acepte.
  const { sellarRol } = await import('./rol-cache.ts')
  const cookieDeRol = await sellarRol({ uid: UID, rol: 'direccion' }, SECRETO)
  assert.equal(await leerVerComo(cookieDeRol, { uid: UID }, SECRETO), null)
})

test('LA LENTE SÓLO RESTRINGE: ni Dirección ni Cliente son roles mirables', () => {
  assert.equal(esRolMirable('direccion'), false)
  assert.equal(esRolMirable('cliente'), false)
  assert.equal(esRolMirable('inventado'), false)
  assert.deepEqual([...ROLES_MIRABLES], ['administracion', 'jefe_obra', 'campo'])
})

test('con la lente puesta, escribir es todo lo que no sea leer', () => {
  assert.equal(esPeticionDeEscritura('GET'), false)
  assert.equal(esPeticionDeEscritura('HEAD'), false)
  // Un Server Action de Next viaja como POST al path de la pantalla: por eso se corta por método.
  assert.equal(esPeticionDeEscritura('POST'), true)
  assert.equal(esPeticionDeEscritura('PATCH'), true)
  assert.equal(esPeticionDeEscritura('DELETE'), true)
  assert.equal(esPeticionDeEscritura('PUT'), true)
})

test('sin cookie no hay lente, y eso es el estado normal de la app', async () => {
  assert.equal(await leerVerComo(undefined, { uid: UID }, SECRETO), null)
  assert.equal(await leerVerComo('', { uid: UID }, SECRETO), null)
  assert.equal(await leerVerComo('cualquier-cosa', { uid: UID }, SECRETO), null)
})
