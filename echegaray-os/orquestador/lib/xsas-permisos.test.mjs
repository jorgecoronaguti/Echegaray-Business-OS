// LOS PERMISOS DE LA PUERTA. El defecto que atrapan: que un rol herede lo que no le toca.
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  permisosDeRol, actorDeMattermost, PERMISOS_POR_ROL,
  TOOLS_AUTORIZADAS_A_ESCRIBIR, escribeAfuera, autorizadaAEscribir,
} from './xsas-permisos.mjs'

test('un rol desconocido NO hereda los permisos del vecino: se queda sin ninguno', () => {
  assert.deepEqual(permisosDeRol('gerente-de-nada'), [])
  assert.deepEqual(permisosDeRol(null), [])
  assert.deepEqual(permisosDeRol(''), [])
})

test('campo no lee por el chat lo que la web le cierra', () => {
  assert.deepEqual(permisosDeRol('campo'), [])
})

// El 27/08/2026 el dueño autorizó `drive.write`. Este test decía «nadie escribe» y era correcto
// hasta ese día; lo que protegía —que la escritura no se cuele por descuido de configuración— sigue
// protegido, pero por la regla nueva: escribe UN rol, y sólo por tools nombradas.
test('la escritura la tiene UN solo rol, y no es un rol operativo', () => {
  const conEscritura = Object.entries(PERMISOS_POR_ROL)
    .filter(([, caps]) => caps.some((c) => escribeAfuera(c)))
    .map(([rol]) => rol)
  assert.deepEqual(conEscritura, ['direccion'])
  for (const rol of ['administracion', 'jefe_obra', 'campo']) {
    assert.equal(permisosDeRol(rol).some(escribeAfuera), false, `${rol} no puede escribir afuera`)
  }
})

test('una capability de escritura sólo vale para una tool NOMBRADA — fail-closed', () => {
  assert.equal(autorizadaAEscribir('slides.crear'), true)
  assert.equal(autorizadaAEscribir('imagen.generar'), true)
  assert.equal(autorizadaAEscribir('una.tool.nueva'), false)
  assert.equal(autorizadaAEscribir(null), false)
  assert.equal(autorizadaAEscribir(undefined), false)
})

test('la lista de tools que escriben es corta y explícita: crecer es una decisión, no un accidente', () => {
  assert.deepEqual([...TOOLS_AUTORIZADAS_A_ESCRIBIR], ['slides.crear', 'imagen.generar'])
})

test('lo que NO escribe afuera no queda marcado como escritura', () => {
  assert.equal(escribeAfuera('drive.read'), false)
  assert.equal(escribeAfuera('os.read'), false)
  assert.equal(escribeAfuera(null), false)
})

test('la lista devuelta es una copia: mutarla no le agrega permisos a un rol', () => {
  const p = permisosDeRol('jefe_obra')
  p.push('drive.write')
  assert.equal(permisosDeRol('jefe_obra').includes('drive.write'), false)
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
