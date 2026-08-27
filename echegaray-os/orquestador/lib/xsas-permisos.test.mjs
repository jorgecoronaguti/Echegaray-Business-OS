// LOS PERMISOS DE LA PUERTA. El defecto que atrapan: que un rol herede lo que no le toca.
import test from 'node:test'
import assert from 'node:assert/strict'

import { permisosDeRol, actorDeMattermost, PERMISOS_POR_ROL } from './xsas-permisos.mjs'

test('un rol desconocido NO hereda los permisos del vecino: se queda sin ninguno', () => {
  assert.deepEqual(permisosDeRol('gerente-de-nada'), [])
  assert.deepEqual(permisosDeRol(null), [])
  assert.deepEqual(permisosDeRol(''), [])
})

test('campo no lee por el chat lo que la web le cierra', () => {
  assert.deepEqual(permisosDeRol('campo'), [])
})

test('EN P0 NADIE ESCRIBE POR LA PUERTA — ninguna capability de escritura está habilitada', () => {
  const todas = Object.values(PERMISOS_POR_ROL).flat()
  assert.deepEqual(todas.filter((c) => /write|delete|create|update/i.test(c)), [])
})

test('la lista devuelta es una copia: mutarla no le agrega permisos a un rol', () => {
  const p = permisosDeRol('direccion')
  p.push('drive.write')
  assert.equal(permisosDeRol('direccion').includes('drive.write'), false)
})

test('sin identidad registrada en Mattermost no hay permisos, y el actor igual existe', async () => {
  const a = await actorDeMattermost({ query: async () => ({ rows: [] }) }, { userId: 'u-x', username: 'nadie' })
  assert.deepEqual(a.permisos, [])
  assert.equal(a.rol, 'desconocido')
  assert.equal(a.id, 'mm:u-x')
})

test('SI LA BASE NO CONTESTA, NO SE DAN PERMISOS DE MÁS', async () => {
  const a = await actorDeMattermost({ query: async () => { throw new Error('base caída') } }, { userId: 'u-jorge' })
  assert.deepEqual(a.permisos, [])
})

test('con perfil, los permisos salen del rol de `perfiles`', async () => {
  const port = { query: async () => ({ rows: [{ rol: 'jefe_obra', nombre: 'Rodrigo' }] }) }
  const a = await actorDeMattermost(port, { userId: 'u-rodrigo' })
  assert.equal(a.rol, 'jefe_obra')
  assert.deepEqual(a.permisos, ['drive.read', 'os.read'])
  assert.equal(a.nombre, 'Rodrigo')
})
