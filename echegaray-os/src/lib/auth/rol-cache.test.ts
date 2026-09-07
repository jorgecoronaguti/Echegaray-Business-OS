import test from 'node:test'
import assert from 'node:assert/strict'
import { sellarRol, leerRol, VIDA_ROL_SEGUNDOS, secretoDelRol } from './rol-cache.ts'

const S = 'secreto-de-prueba'
const T0 = 1_757_260_800_000 // 07/09/2026

test('el rol sellado se lee de vuelta para el mismo usuario dentro de su vida', async () => {
  const c = await sellarRol({ uid: 'u1', rol: 'direccion', ahora: T0 }, S)
  assert.equal(await leerRol(c, { uid: 'u1', ahora: T0 + 60_000 }, S), 'direccion')
})

test('vencida, de otro usuario o alterada NO vale — y no lanza: vale un viaje a la base', async () => {
  const c = await sellarRol({ uid: 'u1', rol: 'campo', ahora: T0 }, S)
  assert.equal(await leerRol(c, { uid: 'u1', ahora: T0 + (VIDA_ROL_SEGUNDOS + 1) * 1000 }, S), null, 'vencida')
  assert.equal(await leerRol(c, { uid: 'u2', ahora: T0 }, S), null, 'otro usuario')
  // Un 'campo' que se escribe 'direccion' en la cookie: la firma no cierra.
  assert.equal(await leerRol(c.replace('campo', 'direccion'), { uid: 'u1', ahora: T0 }, S), null, 'rol alterado')
  assert.equal(await leerRol(c, { uid: 'u1', ahora: T0 }, 'otro-secreto'), null, 'otro secreto')
  assert.equal(await leerRol('basura', { uid: 'u1', ahora: T0 }, S), null)
  assert.equal(await leerRol(undefined, { uid: 'u1', ahora: T0 }, S), null)
})

test('el secreto sale del entorno que ya existe en producción; sin ninguno, null y no una cadena vacía', () => {
  assert.equal(secretoDelRol({ PORTAL_SECRETO: 'p' }), 'p')
  assert.equal(secretoDelRol({ OS_ROL_SECRETO: 'o', PORTAL_SECRETO: 'p' }), 'o')
  assert.equal(secretoDelRol({}), null)
})
