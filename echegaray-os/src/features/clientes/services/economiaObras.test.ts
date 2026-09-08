import test from 'node:test'
import assert from 'node:assert/strict'
import { aNumero, margenPct, pctTexto, sumaConHuecos } from './economiaObras.ts'

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
