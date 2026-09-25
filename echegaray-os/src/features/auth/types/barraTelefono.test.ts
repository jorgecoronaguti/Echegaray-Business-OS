import test from 'node:test'
import assert from 'node:assert/strict'
import { barraTelefonoDe, itemActivoDeBarra } from './barraTelefono.ts'
import { puedeVerRuta } from './areas.ts'
import { esRutaCampoPermitida } from './index.ts'

const claves = (rol: Parameters<typeof barraTelefonoDe>[0]) => barraTelefonoDe(rol).map((i) => i.clave)

test('Dirección y Administración: barra de gestión Obras · Personal · Compras · Analíticas · Más (dueño 24/09, B)', () => {
  assert.deepEqual(claves('direccion'), ['obras', 'personal', 'compras', 'analiticas', 'mas'])
  assert.deepEqual(claves('administracion'), claves('direccion'))
  // «Analíticas» para todos, nunca «Datos» (dueño, 24/09/2026).
  assert.equal(barraTelefonoDe('direccion').find((i) => i.clave === 'analiticas')?.label, 'Analíticas')
})

test('el jefe de obra tiene UNA barra en todo el teléfono: la de J01 (dueño 24/09)', () => {
  assert.deepEqual(barraTelefonoDe('jefe_obra').map((i) => i.label), ['Hoy', 'Tareas', 'Avance', 'Gente'])
  assert.equal(barraTelefonoDe('jefe_obra')[0].href, '/obra/hoy')
})

// CAMBIO DE CONTRATO (24/09/2026): el empleado tenía «ninguna» porque su barra vive en su app. Pero
// abre `/mi-cuenta` (su perfil y su contraseña, sin copia en su app) y ahí quedaba sin barra y sin
// salida. Ahora ve la MISMA de su app.
test('el empleado ve en el escritorio la misma barra de su app: Hoy · Trabajo · Horas · Yo', () => {
  assert.deepEqual(barraTelefonoDe('campo').map((i) => i.label), ['Hoy', 'Trabajo', 'Horas', 'Yo'])
  assert.deepEqual(barraTelefonoDe('campo').map((i) => i.href), ['/hoy', '/mi-trabajo', '/mi-informacion/horas', '/mi-informacion'])
  assert.equal(itemActivoDeBarra('/mi-cuenta', barraTelefonoDe('campo')), 'op-yo')
  for (const i of barraTelefonoDe('campo')) assert.equal(esRutaCampoPermitida(i.href), true, `campo → ${i.href}`)
})

test('cliente y sin perfil: sin barra (fallar cerrado)', () => {
  assert.deepEqual(claves('cliente'), [])
  assert.deepEqual(claves(null), [])
  assert.deepEqual(claves(undefined), [])
})

test('nunca se ofrece un destino que el middleware va a rebotar', () => {
  for (const rol of ['direccion', 'administracion', 'jefe_obra'] as const) {
    for (const i of barraTelefonoDe(rol)) assert.equal(puedeVerRuta(rol, i.href), true, `${rol} → ${i.href}`)
  }
})

test('a lo sumo cinco: más no entran en 390 px con el pulgar', () => {
  for (const rol of ['direccion', 'administracion', 'jefe_obra'] as const) assert.ok(barraTelefonoDe(rol).length <= 5)
})

test('cuál se enciende: el href más largo gana y las rutas de Administración encienden Admin.', () => {
  const b = barraTelefonoDe('direccion')
  assert.equal(itemActivoDeBarra('/obras/x/dotacion', b), 'obras')
  assert.equal(itemActivoDeBarra('/administracion/personas/asistencia', b), 'personal')
  assert.equal(itemActivoDeBarra('/administracion/personas/correcciones', b), 'personal')
  assert.equal(itemActivoDeBarra('/administracion/compras', b), 'compras')
  assert.equal(itemActivoDeBarra('/administracion/proveedores/x', b), 'compras')
  assert.equal(itemActivoDeBarra('/analiticas', b), 'analiticas')
  assert.equal(itemActivoDeBarra('/mas', b), 'mas')
  assert.equal(itemActivoDeBarra('/clientes/la-estrella', b), 'mas')
  assert.equal(itemActivoDeBarra('/presupuestos', b), 'mas')
  assert.equal(itemActivoDeBarra('/campo/herramientas/buscar', b), 'mas')
  assert.equal(itemActivoDeBarra('/h/HER-0042', b), 'mas')
  assert.equal(itemActivoDeBarra('/mi-cuenta/legajo', b), 'mas')
  assert.equal(itemActivoDeBarra('/obras-viejas', b), null)
  assert.equal(itemActivoDeBarra('/', b), null)
  const j = barraTelefonoDe('jefe_obra')
  assert.equal(itemActivoDeBarra('/obra/tareas', j), 'jefe-tareas')
  assert.equal(itemActivoDeBarra('/obra/avance-masivo', j), 'jefe-hoy')
  assert.equal(itemActivoDeBarra('/campo/herramientas', j), 'jefe-hoy')
  assert.equal(itemActivoDeBarra('/administracion/personas/asistencia', j), 'jefe-gente')
  // Personal entero es «Gente» para el jefe (24/09/2026): Plantel, Horas y cuadrillas.
  assert.equal(itemActivoDeBarra('/administracion/personas', j), 'jefe-gente')
  assert.equal(itemActivoDeBarra('/administracion/personas/cuadrillas', j), 'jefe-gente')
  assert.equal(itemActivoDeBarra('/obras', j), null)
})
