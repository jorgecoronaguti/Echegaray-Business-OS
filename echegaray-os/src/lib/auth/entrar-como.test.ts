import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NIVELES_ENTRABLES, VIDA_ENTRAR_COMO_SEGUNDOS, leerEntrarComo, puedeEntrarComo, sellarEntrarComo,
} from './entrar-como.ts'

const SECRETO = 'secreto-de-prueba-no-es-el-de-produccion'
const DIRECCION = '11111111-2222-3333-4444-555555555555'
const OBJETIVO = '99999999-8888-7777-6666-555555555555'
const AUD = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

test('la entrada sellada se lee desde la sesión del objetivo y dice a quién volver', async () => {
  const cookie = await sellarEntrarComo({ direccionId: DIRECCION, objetivoId: OBJETIVO, auditoriaId: AUD }, SECRETO)
  const e = await leerEntrarComo(cookie, { uidSesion: OBJETIVO }, SECRETO)
  assert.deepEqual(e, { direccionId: DIRECCION, objetivoId: OBJETIVO, auditoriaId: AUD, vencida: false })
})

test('NO VALE DESDE OTRA SESIÓN: la franja «entrando como» no aparece en la cuenta de Dirección ni en una tercera', async () => {
  const cookie = await sellarEntrarComo({ direccionId: DIRECCION, objetivoId: OBJETIVO, auditoriaId: AUD }, SECRETO)
  assert.equal(await leerEntrarComo(cookie, { uidSesion: DIRECCION }, SECRETO), null)
  assert.equal(await leerEntrarComo(cookie, { uidSesion: 'otro' }, SECRETO), null)
})

test('cambiar el uid de Dirección sin refirmar invalida la cookie: nadie elige a dónde «vuelve»', async () => {
  const cookie = await sellarEntrarComo({ direccionId: DIRECCION, objetivoId: OBJETIVO, auditoriaId: AUD }, SECRETO)
  const falsa = cookie.replace(DIRECCION, '00000000-0000-0000-0000-000000000000')
  assert.equal(await leerEntrarComo(falsa, { uidSesion: OBJETIVO }, SECRETO), null)
  assert.equal(await leerEntrarComo(cookie, { uidSesion: OBJETIVO }, 'otro-secreto'), null)
})

test('vencida se sigue leyendo, pero marcada: sirve para volver, no para quedarse', async () => {
  const ahora = Date.now()
  const cookie = await sellarEntrarComo({ direccionId: DIRECCION, objetivoId: OBJETIVO, auditoriaId: AUD, ahora }, SECRETO)
  const despues = ahora + (VIDA_ENTRAR_COMO_SEGUNDOS + 1) * 1000
  assert.equal((await leerEntrarComo(cookie, { uidSesion: OBJETIVO, ahora }, SECRETO))?.vencida, false)
  assert.equal((await leerEntrarComo(cookie, { uidSesion: OBJETIVO, ahora: despues }, SECRETO))?.vencida, true)
})

test('una cookie de la lente («ver como») no vale como entrada', async () => {
  const { sellarVerComo } = await import('./ver-como.ts')
  const lente = await sellarVerComo({ uid: OBJETIVO, rol: 'campo' }, SECRETO)
  assert.equal(await leerEntrarComo(lente, { uidSesion: OBJETIVO }, SECRETO), null)
})

test('SÓLO DIRECCIÓN ENTRA, Y NUNCA COMO OTRA DIRECCIÓN', () => {
  assert.equal(puedeEntrarComo('direccion', 'administracion'), true)
  assert.equal(puedeEntrarComo('direccion', 'campo'), true)
  assert.equal(puedeEntrarComo('direccion', 'cliente'), true)
  assert.equal(puedeEntrarComo('direccion', null), true, 'una cuenta sin perfil se puede mirar')
  assert.equal(puedeEntrarComo('direccion', 'direccion'), false)
  assert.equal(puedeEntrarComo('administracion', 'campo'), false)
  assert.equal(puedeEntrarComo(null, 'campo'), false)
  assert.ok(!NIVELES_ENTRABLES.includes('direccion'))
})
