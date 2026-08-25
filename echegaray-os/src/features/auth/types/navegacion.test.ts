import test from 'node:test'
import assert from 'node:assert/strict'
import { solapaActiva, solapasDeNav } from './navegacion.ts'

// LA BARRA DE NIVEL 1 — «dónde estoy» en las rutas de primer nivel.
//
// Esta regla YA SE ROMPIÓ UNA VEZ (24/08, commit fdfdb03e): `/presupuestos`, `/documentos` y
// `/flujo-caja` no pintaban ninguna solapa, así que la navegación no decía dónde estabas parado. Se
// arregló en el componente, con una expresión regular adentro de un archivo `'use client'` que
// `node --test` no podía mirar. Ahora la regla es una función pura y esto es lo que la fija.

const claves = (rol: Parameters<typeof solapasDeNav>[0]) => solapasDeNav(rol).map((s) => s.clave)
const activa = (ruta: string, rol: Parameters<typeof solapasDeNav>[0] = 'direccion') =>
  solapaActiva(ruta, solapasDeNav(rol))

test('Administración ve TRES solapas: Presupuestos subió a nivel 1', () => {
  assert.deepEqual(claves('direccion'), ['administracion', 'obras', 'presupuestos'])
  assert.deepEqual(claves('administracion'), ['administracion', 'obras', 'presupuestos'])
})

test('el jefe de obra NO ve Presupuestos: un presupuesto ES precio', () => {
  // La ruta está en `RUTAS_SOLO_ECONOMIA` y la base cierra `cotizaciones_select` con
  // `ve_economia()`. Dibujarle la solapa sería una pantalla más ancha que la base.
  assert.deepEqual(claves('jefe_obra'), ['administracion', 'obras'])
  assert.deepEqual(claves('campo'), ['obras'])
  assert.deepEqual(claves(null), ['obras'], 'sin perfil se cae al nivel MENOS privilegiado')
})

test('cada ruta de primer nivel dice dónde estás', () => {
  assert.equal(activa('/presupuestos'), 'presupuestos')
  assert.equal(activa('/presupuestos/casa-luna/partida/3'), 'presupuestos')
  // LO QUE NO CAMBIA de la corrección del 24/08: estas tres siguen pintando Administración.
  assert.equal(activa('/documentos'), 'administracion')
  assert.equal(activa('/flujo-caja'), 'administracion')
  assert.equal(activa('/clientes/la-estrella'), 'administracion')
  assert.equal(activa('/administracion/pendientes'), 'administracion')
  // Y `/obra` (el workspace del jefe) sigue pintando Obras.
  assert.equal(activa('/obra'), 'obras')
  assert.equal(activa('/obras/le-comedor/tareas'), 'obras')
  assert.equal(activa('/control-obras'), 'obras')
})

test('un prefijo no es una ruta: `/clientes-vip` no es Clientes', () => {
  // La expresión anterior no exigía el corte, así que cualquier ruta que EMPEZARA con esas letras
  // encendía la solapa. Hoy no existe `/obras-viejas`, pero el día que exista no puede heredar el
  // «dónde estoy» de otra área.
  assert.equal(activa('/clientes-vip'), null)
  assert.equal(activa('/presupuestos-2025'), null)
})

test('con una sola solapa, esa es la activa esté donde esté', () => {
  // El nivel Obras no dibuja una barra de un elemento: dibuja el nombre del área. Y `/campo` o
  // `/mi-informacion` no empiezan con `/obras`, así que sin este caso se apagaría sola.
  assert.equal(activa('/campo', 'campo'), 'obras')
  assert.equal(activa('/mi-informacion/recibos', 'campo'), 'obras')
})
