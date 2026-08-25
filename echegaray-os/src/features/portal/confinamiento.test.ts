// El aislamiento entre una empresa y sus clientes se prueba acá, sin levantar Next.
import test from 'node:test'
import assert from 'node:assert/strict'
import { destinoPorRol, esRutaPortal, RUTA_PORTAL_INGRESAR } from './rutas.ts'

test('el cliente se queda dentro del portal y no ve nada de adentro', () => {
  assert.equal(destinoPorRol('cliente', '/portal'), null)
  assert.equal(destinoPorRol('cliente', '/portal/obra/arcor'), null)
  for (const ruta of ['/', '/obras', '/flujo-caja', '/clientes/arcor', '/administracion/usuarios']) {
    assert.equal(destinoPorRol('cliente', ruta), '/portal', `${ruta} no puede abrirse para un cliente`)
  }
})

test('nadie de adentro entra al portal — ahí vería la pantalla del cliente vacía y creería que no tiene nada', () => {
  for (const rol of ['direccion', 'administracion', 'jefe_obra', 'campo']) {
    assert.equal(destinoPorRol(rol, '/portal'), '/')
    assert.equal(destinoPorRol(rol, '/portal/obra/arcor'), '/')
  }
})

test('un rol desconocido o ausente no es cliente y tampoco entra al portal: falla cerrado', () => {
  for (const rol of [null, undefined, '', 'admin', 'CLIENTE', 'superusuario']) {
    assert.equal(destinoPorRol(rol, '/portal'), '/', `«${rol}» no puede pasar por cliente`)
    assert.equal(destinoPorRol(rol, '/obras'), null, 'fuera del portal lo deciden las otras reglas')
  }
})

test('una ruta que sólo EMPIEZA como el portal no es el portal', () => {
  // `/portales` o `/portal-interno` no pueden heredar el permiso del portal por prefijo.
  assert.equal(esRutaPortal('/portales'), false)
  assert.equal(esRutaPortal('/portal-interno'), false)
  assert.equal(esRutaPortal('/portal'), true)
  assert.equal(esRutaPortal('/portal/'), true)
  assert.equal(esRutaPortal('/portal/obra/x'), true)
})

test('la puerta de ingreso está dentro del portal: si no, el cliente no podría ni pedir el link', () => {
  assert.equal(esRutaPortal(RUTA_PORTAL_INGRESAR), true)
  assert.equal(destinoPorRol('cliente', RUTA_PORTAL_INGRESAR), null)
})
