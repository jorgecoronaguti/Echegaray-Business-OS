import test from 'node:test'
import assert from 'node:assert/strict'
import { aNumero, sumaConHuecos } from './economiaObras.ts'

// ═══ LO QUE ESTE ARCHIVO YA NO PRUEBA, Y POR QUÉ ═══
//
// Tenía los casos de `margenPct`, `pctTexto` y `margenDeLaFila` —incluido el del «2.603.726 %» de
// Quattropani, que era un porcentaje imposible publicado como si fuera un dato—. Las tres funciones
// se retiraron el 10/09/2026 con las dos columnas Margen que las usaban («quitá esa columna Margen,
// no es útil»). Un test de una función que nadie llama es verde que no cuida nada.
//
// EL DEFECTO NO QUEDÓ SIN CUIDAR: el margen de una obra vive en `features/obras` —`obra_economia`,
// `planVsReal`—, que lo mide contra el costo REAL y tiene sus propios tests. Acá quedó lo que sigue
// teniendo consumidor: leer un `numeric` de PostgREST sin convertir un hueco en cero, y sumar sin
// inventar.

test('numeric de PostgREST llega como texto; null y vacío se quedan null, nunca 0', () => {
  assert.equal(aNumero('47590272.00'), 47_590_272)
  assert.equal(aNumero(null), null)
  assert.equal(aNumero(''), null)
  assert.equal(aNumero('x'), null)
  assert.equal(aNumero(0), 0)
})

test('suma con huecos: nada → null; algunos → suma marcada parcial; todos → suma', () => {
  assert.deepEqual(sumaConHuecos([null, null]), { total: null, parcial: false })
  assert.deepEqual(sumaConHuecos([10, null, 5]), { total: 15, parcial: true })
  assert.deepEqual(sumaConHuecos([10, 5]), { total: 15, parcial: false })
  assert.deepEqual(sumaConHuecos([]), { total: null, parcial: false })
})
