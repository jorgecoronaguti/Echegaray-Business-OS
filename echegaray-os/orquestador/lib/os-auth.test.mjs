// EL PORTÓN DEL OS. El caso que importa es el primero: sin llave configurada, no entra nadie.

import test from 'node:test'
import assert from 'node:assert/strict'
import { decidirAcceso, esRutaAbierta } from './os-auth.mjs'

const sinUsuarios = async () => null
const conUsuario = (llave, email) => async (b) => (b === llave ? email : null)

test('SIN LLAVE CONFIGURADA NO ATIENDE — y no es lo mismo que dejar pasar', async () => {
  // ═══ ÉSTE ES EL DEFECTO QUE SE ESTÁ TAPANDO ═══
  //
  // La versión anterior sólo devolvía 401 `else if (TOKEN)`. Con la variable vacía, una petición
  // sin `Authorization` seguía de largo hacia las rutas protegidas con la identidad del dueño, y
  // el OS está publicado a internet por el proxy `/api/os/*`. Con el código viejo, este test pasa
  // a ser el único que falla.
  const r = await decidirAcceso({ token: '', authorization: '', buscarUsuario: sinUsuarios })
  assert.equal(r.ok, false)
  assert.equal(r.status, 503)
})

test('sin llave configurada, tampoco entra el que trae una llave inventada', async () => {
  const r = await decidirAcceso({ token: '', authorization: 'Bearer lo-que-sea', buscarUsuario: sinUsuarios })
  assert.equal(r.ok, false)
  assert.equal(r.status, 503)
})

test('sin Authorization no se entra', async () => {
  const r = await decidirAcceso({ token: 'LLAVE', authorization: '', buscarUsuario: sinUsuarios })
  assert.equal(r.ok, false)
  assert.equal(r.status, 401)
})

test('una llave que no es la del OS ni la de un usuario no entra', async () => {
  const r = await decidirAcceso({ token: 'LLAVE', authorization: 'Bearer otra', buscarUsuario: sinUsuarios })
  assert.equal(r.ok, false)
  assert.equal(r.status, 401)
})

test('la llave compartida entra como el dueño', async () => {
  const r = await decidirAcceso({ token: 'LLAVE', authorization: 'Bearer LLAVE', buscarUsuario: sinUsuarios })
  assert.equal(r.ok, true)
  assert.equal(r.email, null)
})

test('el prefijo Bearer es opcional y no cambia la decisión', async () => {
  // La extensión manda "Bearer x"; algún cliente manda la llave pelada. Las dos son la misma llave.
  const r = await decidirAcceso({ token: 'LLAVE', authorization: 'LLAVE', buscarUsuario: sinUsuarios })
  assert.equal(r.ok, true)
})

test('la llave por usuario trae SU email, que no se auto-declara', async () => {
  const r = await decidirAcceso({
    token: 'LLAVE', authorization: 'Bearer k-jefe', buscarUsuario: conUsuario('k-jefe', 'jefe@ecsas.com.ar'),
  })
  assert.equal(r.ok, true)
  assert.equal(r.email, 'jefe@ecsas.com.ar')
})

test('si la base no contesta, la llave NO se da por buena', async () => {
  // Falla cerrado también acá: un error de lectura no puede ser una credencial válida.
  const r = await decidirAcceso({
    token: 'LLAVE', authorization: 'Bearer k', buscarUsuario: async () => { throw new Error('sin base') },
  })
  assert.equal(r.ok, false)
  assert.equal(r.status, 401)
})

test('las rutas abiertas son las que no pueden traer la llave, y ninguna más', async () => {
  for (const abierta of ['/version', '/oauth/start', '/oauth/exchange?code=x', '/extension.zip', '/']) {
    assert.equal(esRutaAbierta(abierta), true, abierta)
  }
  for (const cerrada of ['/ask', '/pending', '/progress', '/operation-status', '/approve']) {
    assert.equal(esRutaAbierta(cerrada), false, cerrada)
  }
})
