// LA PUERTA: QUÉ RUTA ABRE CADA NIVEL.
//
// No reemplaza al RLS —la cerradura está en Postgres y se mide en `autorizacion-por-obra.spec.ts`—,
// pero una puerta mal puesta tiene dos modos de falla caros: deja entrar a una pantalla que va a
// mostrarse vacía y desconcertante, o rebota a alguien de una pantalla que necesita para trabajar.
// La segunda es la que se pagó dos veces: *"La política anterior quedó DEMASIADO restrictiva."*
//
// ═══ LA REGLA VIGENTE (19/08/2026) ═══
//
// El dueño: *"quiero que los usuarios con permisos de «jefe de obra» pueda acceder a administracion,
// solo no quiero que vean los montos de venta de las obras"* y, precisando: *"los costos de las obras
// que se han estipulado en la cotización… y lo que se lleva gastado, sí tienen que ver"*.
//
// La línea es COSTO / PRECIO, no «administración / obras».

import test from 'node:test'
import assert from 'node:assert/strict'
import { puedeVerRuta, areaDe, esAdministracion, areasDe, veEconomia } from './areas.ts'

test('Dirección y Administración abren todo', () => {
  for (const rol of ['direccion', 'administracion'] as const) {
    for (const r of ['/administracion', '/administracion/usuarios', '/clientes', '/clientes/arcor',
      '/obras', '/calendario-financiero']) {
      assert.equal(puedeVerRuta(rol, r), true, `${rol} no pudo abrir ${r}`)
    }
  }
})

test('EL JEFE DE OBRA ENTRA A ADMINISTRACIÓN', () => {
  // Personas, legajos, cuadrillas, clientes, proveedores y pendientes: todo eso es administrar los
  // maestros, y es su trabajo. Antes rebotaba en la puerta y la pantalla ni se dibujaba.
  for (const r of ['/administracion', '/administracion/personas', '/administracion/proveedores',
    '/administracion/clientes', '/administracion/pendientes', '/clientes', '/clientes/arcor']) {
    assert.equal(puedeVerRuta('jefe_obra', r), true, `un jefe de obra no pudo abrir ${r}`)
  }
  assert.equal(areaDe('jefe_obra'), 'administracion')
  assert.deepEqual(areasDe('jefe_obra'), ['administracion', 'obras'])
})

test('PERO NO ENTRA A LAS RUTAS DEL DINERO', () => {
  for (const r of ['/calendario-financiero', '/reportes', '/aprobaciones']) {
    assert.equal(puedeVerRuta('jefe_obra', r), false, `un jefe de obra pudo abrir ${r}`)
  }
  assert.equal(veEconomia('jefe_obra'), false)
})

test('NI AL ARCHIVO TRANSVERSAL: ahí están los libros de sueldos y el archivo fiscal', () => {
  // `/documentos` lista las tres carpetas raíz del índice de Drive —`administracion`,
  // `archivo-fiscal`, `libro-sueldos`—, o sea presupuestos de clientes, declaraciones y sueldos.
  // El jefe de obra ve los documentos DE SU OBRA en la obra; esta vista es de la empresa entera.
  assert.equal(puedeVerRuta('jefe_obra', '/documentos'), false, 'un jefe de obra abrió el archivo entero')
  assert.equal(puedeVerRuta('campo', '/documentos'), false)
  assert.equal(puedeVerRuta(null, '/documentos'), false, 'sin perfil tiene que fallar cerrado')
  assert.equal(puedeVerRuta('administracion', '/documentos'), true)
  assert.equal(puedeVerRuta('direccion', '/documentos'), true)
})

test('la ficha de un proveedor SÍ la abre el jefe de obra: es costo, no precio', () => {
  // El dueño, 19/08: ve el costo de su obra y lo que se lleva gastado. La base recorta las filas
  // (`ve_obra_texto`), así que la ficha le muestra sus comprobantes y nada más.
  assert.equal(puedeVerRuta('jefe_obra', '/administracion/proveedores/abc-123'), true)
  assert.equal(puedeVerRuta('jefe_obra', '/administracion/proveedores/abc-123?vista=comprobantes'), true)
})

test('NI A GESTIONAR USUARIOS, que es la puerta a todo lo anterior', () => {
  // Si pudiera cambiar roles, se ascendería y el resto del corte sería decorativo.
  assert.equal(puedeVerRuta('jefe_obra', '/administracion/usuarios'), false)
  assert.equal(puedeVerRuta('jefe_obra', '/administracion/usuarios/nuevo'), false)
})

test('el nivel Obras trabaja sus obras', () => {
  for (const r of ['/obras', '/obras/san-francisco', '/obras/san-francisco?vista=economia']) {
    assert.equal(puedeVerRuta('jefe_obra', r), true, `un jefe de obra no pudo abrir ${r}`)
  }
})

test('el rol CAMPO sigue afuera de todo lo administrativo', () => {
  // Abrir Administración fue para el jefe de obra y sólo para él: `campo` no cambió.
  assert.equal(areaDe('campo'), 'obras')
  assert.equal(esAdministracion('campo'), false)
  assert.equal(puedeVerRuta('campo', '/calendario-financiero'), false)
})

test('sin perfil se cae al nivel MENOS privilegiado', () => {
  // El modo de fallar de un default permisivo es publicar cuánto se vendió cada obra.
  assert.equal(areaDe(null), 'obras')
  assert.equal(esAdministracion(undefined), false)
  assert.equal(veEconomia(null), false)
  assert.deepEqual(areasDe(null), ['obras'])
  assert.equal(puedeVerRuta(null, '/calendario-financiero'), false)
})
