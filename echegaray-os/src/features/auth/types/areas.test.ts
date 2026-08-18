// LA PUERTA: QUÉ RUTA ABRE CADA NIVEL.
//
// No reemplaza al RLS —la cerradura está en Postgres y se mide en `autorizacion-por-obra.spec.ts`—,
// pero una puerta mal puesta tiene dos modos de falla caros: deja entrar a una pantalla que va a
// mostrarse vacía y desconcertante, o rebota a alguien de una pantalla que necesita para trabajar.
// La segunda es la que se pagó el 19/08: *"La política anterior quedó DEMASIADO restrictiva."*

import test from 'node:test'
import assert from 'node:assert/strict'
import { puedeVerRuta, areaDe, esAdministracion, areasDe } from './areas.ts'

test('Administración abre todo', () => {
  for (const rol of ['direccion', 'administracion'] as const) {
    for (const r of ['/administracion', '/clientes', '/clientes/arcor', '/obras', '/flujo-caja']) {
      assert.equal(puedeVerRuta(rol, r), true, `${rol} no pudo abrir ${r}`)
    }
  }
})

test('el nivel Obras no administra el maestro ni entra a Finanzas', () => {
  for (const r of ['/administracion', '/administracion/usuarios', '/clientes',
    '/flujo-caja', '/scorecard-finanzas', '/reportes']) {
    assert.equal(puedeVerRuta('jefe_obra', r), false, `un jefe de obra pudo abrir ${r}`)
  }
})

test('el nivel Obras SÍ abre la ficha de un cliente: es de quién es su obra', () => {
  // La distinción exacta del pedido del 19/08: la CARTERA se administra, la FICHA se consulta.
  assert.equal(puedeVerRuta('jefe_obra', '/clientes/arcor'), true)
  assert.equal(puedeVerRuta('jefe_obra', '/clientes/arcor?vista=contactos'), true)
  assert.equal(puedeVerRuta('jefe_obra', '/clientes'), false)
  // Y la barra final no es una ficha: `/clientes/` es la cartera con una barra de más.
  assert.equal(puedeVerRuta('jefe_obra', '/clientes/'), false)
})

test('el nivel Obras trabaja sus obras', () => {
  for (const r of ['/obras', '/obras/san-francisco', '/obras/san-francisco?vista=economia']) {
    assert.equal(puedeVerRuta('jefe_obra', r), true, `un jefe de obra no pudo abrir ${r}`)
  }
})

test('sin perfil se cae al nivel MENOS privilegiado', () => {
  // El modo de fallar de un default permisivo es publicar la economía de la empresa.
  assert.equal(areaDe(null), 'obras')
  assert.equal(esAdministracion(undefined), false)
  assert.deepEqual(areasDe(null), ['obras'])
  assert.equal(puedeVerRuta(null, '/clientes'), false)
})
