import test from 'node:test'
import assert from 'node:assert/strict'
import { aNumero, margenDeLaFila, margenPct, pctTexto, sumaConHuecos } from './economiaObras.ts'

test('numeric de PostgREST llega como texto; null y vacío se quedan null, nunca 0', () => {
  assert.equal(aNumero('47590272.00'), 47_590_272)
  assert.equal(aNumero(null), null)
  assert.equal(aNumero(''), null)
  assert.equal(aNumero('x'), null)
  assert.equal(aNumero(0), 0)
})

test('margen %: sobre el contratado; sin contratado o con cero no hay porcentaje', () => {
  // Coma flotante: se compara con tolerancia, no con el literal decimal.
  assert.ok(Math.abs((margenPct(15_425_527, 40_000_000) ?? 0) - 38.5638175) < 1e-9)
  assert.equal(margenPct(null, 40_000_000), null)
  assert.equal(margenPct(10, null), null)
  assert.equal(margenPct(10, 0), null)
  assert.equal(pctTexto(38.56), '39 %')
  assert.equal(pctTexto(-12.3), '-12 %')
  assert.equal(pctTexto(null), null)
})

test('suma con huecos: nada → null; algunos → suma marcada parcial; todos → suma', () => {
  assert.deepEqual(sumaConHuecos([null, null]), { total: null, parcial: false })
  assert.deepEqual(sumaConHuecos([10, null, 5]), { total: 15, parcial: true })
  assert.deepEqual(sumaConHuecos([10, 5]), { total: 15, parcial: false })
  assert.deepEqual(sumaConHuecos([]), { total: null, parcial: false })
})

// ═══ EL PORCENTAJE IMPOSIBLE ═══
//
// Lo que el dueño vio en `/clientes` el 10/09/2026: «$ -39.149.629 · 2.603.726 %» en la fila de
// Franco Quattropani. OBRAS publicaba $1.504 de contratado —un contrato en dólares leído como
// pesos— y el margen se dividió igual. Un porcentaje de siete cifras no es un dato con ruido: es la
// prueba de que numerador y denominador no son de la misma obra, y publicarlo obliga a quien mira a
// descubrirlo solo.
//
// SI SE REVIERTE LA GUARDA, ESTE TEST SE PONE ROJO: la primera línea vuelve a dar −2.603.033 %.

test('un margen % imposible no se publica: por arriba de 100 no puede existir', () => {
  // margen = contratado − MO − materiales, y ningún costo es negativo ⇒ el cociente no pasa de 100.
  assert.equal(margenPct(41_000_000, 40_000_000), null, '102,5 % exigiría un costo negativo')
  assert.equal(margenPct(40_000_000, 40_000_000), 100, 'el 100 % exacto sí existe: costo cero')
})

test('el caso Quattropani: −2.603.033 % no se dibuja, el $ negativo sí', () => {
  assert.equal(
    margenPct(-39_149_629, 1_504), null,
    'con $1.504 de denominador el porcentaje sólo puede confundir; la noticia es el $ negativo',
  )
  // Y el margen real de esa obra, con el contratado que OBRAS publica hoy, sí se dibuja.
  assert.ok(Math.abs((margenPct(56_119_799.26, 95_270_932.26) ?? 0) - 58.9048) < 1e-3)
})

test('una obra que perdió plata sigue publicando su porcentaje mientras sea legible', () => {
  // −150 % es una obra que costó dos veces y media lo que se cobró. Es un desastre REAL y se dice.
  assert.equal(margenPct(-150, 100), -150)
  // −1000 % es el piso: el contratado es la décima parte del costo y el % deja de agregar nada.
  assert.equal(margenPct(-1000, 100), -1000)
  assert.equal(margenPct(-1001, 100), null)
})

// Venía de `chipsCartera.test.ts`, que se retiró con los chips. La REGLA no se retiró: es la única
// definición del margen de una fila, y sin ella un hueco de costo se publica como ganancia.

test('el margen es NULL cuando falta un sumando — NULL nunca es cero', () => {
  // Lo que publica OBRAS manda, aunque los costos no estén.
  assert.equal(margenDeLaFila({ margenPublicado: 88_885_620, contratado: null, costoMo: null, costoMateriales: null }), 88_885_620)
  // Sin margen publicado se deriva, y sólo si están los TRES.
  assert.equal(margenDeLaFila({ margenPublicado: null, contratado: 100, costoMo: 40, costoMateriales: 25 }), 35)
  assert.equal(margenDeLaFila({ margenPublicado: null, contratado: 100, costoMo: 40, costoMateriales: null }), null,
    'sin el costo de materiales, publicar 60 sería declarar ganancia que nadie midió')
  assert.equal(margenDeLaFila({ margenPublicado: null, contratado: null, costoMo: 40, costoMateriales: 25 }), null)
  // Un margen negativo publicado NO se confunde con «falta el dato»: es una obra que pierde plata.
  assert.equal(margenDeLaFila({ margenPublicado: -5, contratado: 10, costoMo: 9, costoMateriales: 6 }), -5)
  assert.equal(margenDeLaFila({ margenPublicado: 0, contratado: 10, costoMo: 5, costoMateriales: 5 }), 0)
})
