import test from 'node:test'
import assert from 'node:assert/strict'
import { barraTelefonoDe, itemActivoDeBarra } from './barraTelefono.ts'
import { puedeVerRuta } from './areas.ts'

const claves = (rol: Parameters<typeof barraTelefonoDe>[0]) => barraTelefonoDe(rol).map((i) => i.clave)

test('Dirección y Administración: cinco destinos, Campo primero (en el teléfono se opera)', () => {
  assert.deepEqual(claves('direccion'), ['campo', 'administracion', 'obras', 'herramientas', 'analiticas'])
  assert.deepEqual(claves('administracion'), claves('direccion'))
})

test('el jefe de obra entra por su obra y no ve Analíticas (es precio)', () => {
  assert.deepEqual(claves('jefe_obra'), ['mi-obra', 'campo', 'administracion', 'obras', 'herramientas'])
  assert.equal(barraTelefonoDe('jefe_obra')[0].href, '/obra/hoy')
})

test('empleado, cliente y sin perfil: sin barra (fallar cerrado)', () => {
  assert.deepEqual(claves('campo'), [])
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
  assert.equal(itemActivoDeBarra('/campo', b), 'campo')
  assert.equal(itemActivoDeBarra('/campo/parte', b), 'campo')
  assert.equal(itemActivoDeBarra('/campo/herramientas/buscar', b), 'herramientas')
  assert.equal(itemActivoDeBarra('/herramientas/inventario?pc=1', b), 'herramientas')
  assert.equal(itemActivoDeBarra('/h/HER-0042', b), 'herramientas')
  assert.equal(itemActivoDeBarra('/administracion/compras', b), 'administracion')
  assert.equal(itemActivoDeBarra('/clientes/la-estrella', b), 'administracion')
  assert.equal(itemActivoDeBarra('/presupuestos', b), 'administracion')
  assert.equal(itemActivoDeBarra('/mi-cuenta/legajo', b), 'administracion')
  assert.equal(itemActivoDeBarra('/obras/x/dotacion', b), 'obras')
  assert.equal(itemActivoDeBarra('/analiticas', b), 'analiticas')
  assert.equal(itemActivoDeBarra('/obras-viejas', b), null)
  assert.equal(itemActivoDeBarra('/', b), null)
  const j = barraTelefonoDe('jefe_obra')
  assert.equal(itemActivoDeBarra('/obra/tareas', j), 'mi-obra')
  assert.equal(itemActivoDeBarra('/obras', j), 'obras')
})
