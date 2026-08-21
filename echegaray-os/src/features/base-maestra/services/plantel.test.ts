// EL PLANTEL POR CATEGORÍA — la parte pura de `getManoDeObra`.
//
// Vive en su propio archivo para que se lea de un vistazo qué mide, pero la función está en
// `reglas.ts`: `node --test` no resuelve importaciones sin extensión, así que una regla escondida
// adentro del servicio de Supabase no se podría probar nunca.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { contarPorCategoria } from './reglas.ts'

test('una persona SIN categoría no se reparte entre las demás', () => {
  // EL DEFECTO: 11 de los 64 legajos no tienen categoría cargada. Repartirlos —o mandarlos a
  // «ayudante» por defecto— inventaría gente en una cuadrilla que no la tiene, y esa cuenta es la
  // que después dice si un frente se puede dotar.
  const m = contarPorCategoria([
    { categoria: 'oficial' }, { categoria: null }, { categoria: undefined },
    { categoria: '   ' }, { categoria: 'oficial' },
  ])
  assert.equal(m.get('oficial'), 2)
  assert.equal([...m.values()].reduce((a, b) => a + b, 0), 2)
  assert.equal(m.has('null'), false)
  assert.equal(m.has(''), false)
})

test('cuenta por la clave exacta que usa categoria_obra', () => {
  const m = contarPorCategoria([
    { categoria: 'oficial_especializado' }, { categoria: 'medio_oficial' },
    { categoria: 'medio_oficial' }, { categoria: 'ayudante' },
  ])
  assert.equal(m.get('oficial_especializado'), 1)
  assert.equal(m.get('medio_oficial'), 2)
  assert.equal(m.get('ayudante'), 1)
  // Una categoría que no existe en el catálogo NO se fuerza a ninguna: queda con su propia clave y
  // la pantalla la muestra sin capacidad ponderada.
  assert.equal(m.get('oficial'), undefined)
})

test('sin nadie cargado el mapa está vacío — y 0 personas es un dato, no una ausencia', () => {
  assert.equal(contarPorCategoria([]).size, 0)
})
