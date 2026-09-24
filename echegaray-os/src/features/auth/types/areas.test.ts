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
import {
  puedeVerRuta, areaDe, esAdministracion, areasDe, veEconomia, liquidaSueldos, destinoDeRebote, fichaDeGestionPara,
} from './areas.ts'

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
  for (const r of ['/administracion', '/administracion/personas', '/administracion/pendientes']) {
    assert.equal(puedeVerRuta('jefe_obra', r), true, `un jefe de obra no pudo abrir ${r}`)
  }
  // CLIENTES Y COMPRAS NO (dueño, 24/09/2026: el jefe no entra a Clientes, Compras, Impuestos, Presupuestos ni Liquidación).
  for (const r of ['/clientes', '/clientes/arcor', '/administracion/compras', '/administracion/proveedores', '/administracion/proveedores/abc']) {
    assert.equal(puedeVerRuta('jefe_obra', r), false, `un jefe de obra pudo abrir ${r}`)
    assert.equal(puedeVerRuta('campo', r), false, `un operario pudo abrir ${r}`)
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

test('la ficha de un proveedor NO la abre el jefe de obra: Proveedores es sección de Compras', () => {
  // Hasta el 24/09/2026 la abría (costo, no precio). El dueño cerró Compras entera al jefe.
  assert.equal(puedeVerRuta('jefe_obra', '/administracion/proveedores/abc-123'), false)
  assert.equal(puedeVerRuta('direccion', '/administracion/proveedores/abc-123'), true)
})

test('NI A GESTIONAR USUARIOS, que es la puerta a todo lo anterior', () => {
  // Si pudiera cambiar roles, se ascendería y el resto del corte sería decorativo.
  assert.equal(puedeVerRuta('jefe_obra', '/administracion/usuarios'), false)
  assert.equal(puedeVerRuta('jefe_obra', '/administracion/usuarios/nuevo'), false)
})

test('el nivel Obras trabaja sus obras: la FICHA sí, la cartera no (24/09/2026)', () => {
  for (const r of ['/obras/san-francisco', '/obras/san-francisco?vista=economia', '/obra/hoy', '/obra/tareas?obra=x']) {
    assert.equal(puedeVerRuta('jefe_obra', r), true, `un jefe de obra no pudo abrir ${r}`)
  }
  // CAMBIO DE CONTRATO (dueño, 24/09/2026): el jefe «deja de tener acciones de Administración» —
  // Nueva obra, Gantt, Más, Fuentes— y se le retira `/campo`. La cartera `/obras` era, además, el
  // «listado gigante de obras activas y no activas» de la queja. Dirección y Administración, igual.
  for (const r of ['/obras', '/obras?archivadas=1', '/obras/gantt', '/obras/nueva', '/mas', '/integraciones', '/integraciones/x', '/campo', '/hoy', '/mi-trabajo', '/mi-trabajo/reportar']) {
    assert.equal(puedeVerRuta('jefe_obra', r), false, `un jefe de obra pudo abrir ${r}`)
    assert.equal(puedeVerRuta('direccion', r), true, `Dirección no pudo abrir ${r}`)
  }
  // Lo que cuelga de su «Hoy» sigue abierto: son las pantallas de trabajo de J01.
  for (const r of ['/campo/material', '/campo/material/pedir', '/campo/impedimento', '/campo/herramientas', '/campo/herramientas/mover', '/mi-informacion', '/mi-informacion/efectivo', '/mi-cuenta']) {
    assert.equal(puedeVerRuta('jefe_obra', r), true, `un jefe de obra no pudo abrir ${r}`)
  }
})

test('LO VITAL: el jefe sigue llegando a Personal y a Cargar asistencia; Liquidación no', () => {
  for (const r of ['/administracion', '/administracion/personas', '/administracion/personas?vista=asistencia', '/administracion/personas/asistencia', '/administracion/personas/cuadrillas', '/administracion/personas/en-obra']) {
    assert.equal(puedeVerRuta('jefe_obra', r), true, `un jefe de obra no pudo abrir ${r}`)
  }
  assert.equal(liquidaSueldos('jefe_obra'), false)
})

test('quien no puede abrir una ruta rebota a SU inicio, no a la cartera', () => {
  assert.equal(destinoDeRebote('jefe_obra'), '/obra/hoy')
  assert.equal(destinoDeRebote('direccion'), '/obras')
  assert.equal(destinoDeRebote(null), '/obras')
  assert.equal(puedeVerRuta('jefe_obra', destinoDeRebote('jefe_obra')), true, 'el rebote del jefe no puede rebotar')
})

test('Dirección y Administración en /obra/* van a la ficha de esa obra (24/09/2026)', () => {
  assert.equal(fichaDeGestionPara('/obra/hoy', 'quattropani'), '/obras/quattropani')
  assert.equal(fichaDeGestionPara('/obra/tareas', 'san-francisco'), '/obras/san-francisco')
  assert.equal(fichaDeGestionPara('/obra/avance-masivo', 'quattropani'), '/obras/quattropani?vista=tareas&sub=parte')
  assert.equal(fichaDeGestionPara('/obra/hoy', null), '/obras', 'sin obra, a la cartera')
  assert.equal(fichaDeGestionPara('/obra/hoy', '../../x'), '/obras', 'un id raro no arma una URL')
  assert.equal(fichaDeGestionPara('/obras/quattropani', 'x'), null, 'la ficha no es del jefe')
  assert.equal(fichaDeGestionPara('/obrador', 'x'), null)
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
