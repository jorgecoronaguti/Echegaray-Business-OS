// LA MATRIZ ROL × RUTA — la puerta con DENEGACIÓN POR DEFECTO (dueño, 25/09/2026).
//
// «Es un desastre las URLs y los logins, cualquiera puede entrar a ver cualquier cosa en computadora o
// mobile.» Medido ese día contra producción: el jefe de obra abría `/os` (el briefing financiero con 430
// importes), `/xsas`, `/administracion/pendientes` y `/administracion/obras/<obra>`, porque la puerta era
// una lista NEGRA y esas pantallas nunca se agregaron.
//
// Esta prueba fija las dos direcciones:
//   1. lo que cada nivel TIENE que poder abrir para trabajar (romperlo deja al jefe sin su portada);
//   2. lo que NO abre nunca, incluida una ruta inventada: una pantalla nueva nace cerrada.
import test from 'node:test'
import assert from 'node:assert/strict'
import { puedeUsarApi, puedeVerRuta } from './areas.ts'
import type { Rol } from './index.ts'

const ADMIN: Rol[] = ['direccion', 'administracion']

// Todas las pantallas de gestión que existen (src/app, 25/09/2026) más una inventada.
const GESTION = [
  '/os', '/xsas', '/reportes', '/aprobaciones', '/calendario-financiero', '/analiticas', '/documentos',
  '/clientes', '/clientes/7b30d4e6-71e7-4f27-95a3-76357350eadc', '/presupuestos', '/presupuestos/nuevo',
  '/presupuestos/x/partida/y', '/presupuestos/x/convertir',
  '/administracion/compras', '/administracion/compras?vista=a-rendir', '/administracion/impuestos',
  '/administracion/proveedores', '/administracion/proveedores/abc', '/administracion/usuarios',
  '/administracion/pendientes', '/administracion/obras/la-estrella',
  '/integraciones', '/descargas', '/mas',
  '/una-pantalla-que-todavia-no-existe',
]

test('Administración abre todo, incluida una ruta nueva', () => {
  for (const rol of ADMIN) for (const r of [...GESTION, '/obras', '/obras/hoy', '/hoy', '/mi-cuenta/entrar-como']) {
    assert.equal(puedeVerRuta(rol, r), true, `${rol} no pudo abrir ${r}`)
  }
})

test('el jefe de obra NO abre nada de gestión (lista blanca: lo nuevo nace cerrado)', () => {
  for (const r of GESTION) assert.equal(puedeVerRuta('jefe_obra', r), false, `el jefe abrió ${r}`)
})

test('el operario NO abre nada de gestión ni lo del jefe', () => {
  for (const r of [...GESTION, '/obras', '/obras/hoy', '/obras/la-estrella', '/obra/hoy', '/campo', '/campo/asistencia',
    '/campo/parte', '/administracion', '/administracion/personas', '/administracion/personas/x', '/administracion/asistencia',
    '/administracion/base-maestra', '/mi-cuenta/entrar-como']) {
    assert.equal(puedeVerRuta('campo', r), false, `el operario abrió ${r}`)
  }
})

test('sin perfil, con un rol desconocido o como cliente del portal: nada', () => {
  for (const rol of [null, undefined, 'cliente', 'otro'] as (Rol | null | undefined)[]) {
    for (const r of ['/obras', '/hoy', '/mi-cuenta', '/herramientas', '/clientes']) {
      assert.equal(puedeVerRuta(rol, r), false, `${String(rol)} abrió ${r}`)
    }
  }
})

test('LO QUE EL JEFE NECESITA PARA TRABAJAR sigue abierto (PC y teléfono)', () => {
  for (const r of ['/obras/hoy', '/obras/hoy?obra=quattropani', '/obras/la-estrella', '/obras/la-estrella?vista=tareas',
    '/obras/la-estrella/cronograma', '/obras/la-estrella/dotacion', '/obras/la-estrella/avance-masivo',
    '/obra/hoy', '/obra/tareas', '/obra/avance', '/obra/personas', '/obra/efectivo', '/obra/frente',
    '/campo/asistencia', '/campo/parte', '/campo/impedimento', '/campo/material', '/campo/material/pedir',
    '/campo/herramientas', '/herramientas', '/herramientas/inventario', '/h/SOL-007',
    '/administracion', '/administracion/personas', '/administracion/personas/518df458', '/administracion/personas/correcciones',
    '/administracion/personas/cuadrillas', '/administracion/base-maestra/tareas',
    '/mi-informacion', '/mi-informacion/efectivo', '/mi-cuenta', '/mi-cuenta/efectivo', '/mi-cuenta/seguridad']) {
    assert.equal(puedeVerRuta('jefe_obra', r), true, `el jefe no pudo abrir ${r}`)
  }
})

test('LO QUE EL OPERARIO NECESITA sigue abierto', () => {
  for (const r of ['/hoy', '/mi-trabajo', '/mi-trabajo/tareas/x', '/mi-trabajo/reportar', '/mi-informacion',
    '/mi-informacion/horas', '/mi-informacion/recibos', '/mi-informacion/efectivo/rendir?entrega=x', '/mi-informacion/epp',
    '/herramientas', '/h/SOL-007', '/campo/herramientas/a/SOL-007', '/campo/material/pedir', '/mi-cuenta', '/mi-cuenta/seguridad',
    '/integraciones/herramientas']) {
    assert.equal(puedeVerRuta('campo', r), true, `el operario no pudo abrir ${r}`)
  }
})

test('un prefijo parecido no abre la puerta', () => {
  assert.equal(puedeVerRuta('jefe_obra', '/obrasx'), false)
  assert.equal(puedeVerRuta('jefe_obra', '/administracion/personasx'), false)
  assert.equal(puedeVerRuta('campo', '/hoyy'), false)
})

test('/api: Administración usa todo; el jefe y el operario sólo el aviso de versión', () => {
  for (const r of ['/api/xsas', '/api/presupuestos/cotizar', '/api/clientes/orden/x', '/api/version']) {
    assert.equal(puedeUsarApi('direccion', r), true, r)
  }
  for (const rol of ['jefe_obra', 'campo'] as Rol[]) {
    assert.equal(puedeUsarApi(rol, '/api/version'), true)
    for (const r of ['/api/xsas', '/api/presupuestos/cotizar', '/api/presupuestos/cotizar/x', '/api/clientes/orden/x', '/api/nueva']) {
      assert.equal(puedeUsarApi(rol, r), false, `${rol} usó ${r}`)
    }
  }
  assert.equal(puedeUsarApi(null, '/api/version'), false)
  assert.equal(puedeUsarApi('cliente', '/api/version'), false)
})
