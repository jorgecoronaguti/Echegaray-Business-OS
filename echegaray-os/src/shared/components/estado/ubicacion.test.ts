// LO QUE ATRAPA: un cartel de error que no sabe dónde está.
//
//   1. QUE LA CARTERA HEREDE EL NOMBRE DE LA FICHA. `/obras` y `/obras/le-comedor` son dos
//      pantallas distintas; un `startsWith` sin cuidado las vuelve la misma y el error dice «no se
//      pudo cargar la ficha de la obra» cuando lo que se cayó fue la lista entera.
//   2. QUE LA VUELTA SEA EL INICIO. Si se cae la ficha de una obra, el lugar al que se quiere ir es
//      la cartera de obras: mandar al inicio obliga a rehacer toda la navegación.
//   3. QUE LA RAÍZ DE UN ÁREA OFREZCA VOLVER A SÍ MISMA.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ubicarPantalla } from './ubicacion.ts'

test('la cartera de obras no se confunde con la ficha de una obra', () => {
  assert.equal(ubicarPantalla('/obras').que, 'la cartera de obras')
  assert.equal(ubicarPantalla('/obras/le-comedor').que, 'la ficha de la obra')
  assert.equal(ubicarPantalla('/obras/gantt').que, 'el Gantt de obras')
})

test('desde una ficha se vuelve a su cartera, nunca al inicio', () => {
  assert.deepEqual(ubicarPantalla('/obras/le-comedor').volver, { href: '/obras', texto: 'Cartera de obras' })
  assert.deepEqual(ubicarPantalla('/clientes/arcor').volver, { href: '/clientes', texto: 'Cartera de clientes' })
  assert.deepEqual(ubicarPantalla('/administracion/personas/8f2').volver, {
    href: '/administracion/personas',
    texto: 'Personas',
  })
})

test('la raíz de un área no ofrece volver a sí misma', () => {
  assert.equal(ubicarPantalla('/obras').volver, null)
  assert.equal(ubicarPantalla('/administracion').volver, null)
  assert.equal(ubicarPantalla('/flujo-caja').volver, null)
})

test('la barra final no cambia la pantalla', () => {
  assert.deepEqual(ubicarPantalla('/obras/'), ubicarPantalla('/obras'))
})

test('una ruta desconocida no inventa un nombre', () => {
  const u = ubicarPantalla('/algo-que-no-existe')
  assert.equal(u.que, 'esta pantalla')
  assert.deepEqual(u.volver, { href: '/', texto: 'Inicio' })
})

test('la raíz no ofrece volver a la raíz', () => {
  assert.equal(ubicarPantalla('/').volver, null)
  assert.equal(ubicarPantalla(null).volver, null)
})

test('las subpantallas de personas se nombran por lo que son', () => {
  assert.equal(ubicarPantalla('/administracion/personas/cuadrillas').que, 'las cuadrillas')
  assert.equal(ubicarPantalla('/administracion/personas/en-obra').que, 'quién está hoy en obra')
  assert.equal(ubicarPantalla('/administracion/personas').que, 'el legajo de personas')
})
