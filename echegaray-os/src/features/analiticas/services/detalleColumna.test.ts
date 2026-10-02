// EL DETALLE DE UNA COLUMNA: qué tramos nombra y con qué importes. Fixture, sin base.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detalleDeColumna } from './detalleColumna.ts'
import { millones } from './formato.ts'

test('cada tramo sale con su nombre y su importe completo, en la escala de la tabla', () => {
  const d = detalleDeColumna({
    titulo: 'sep 26', total: 31_000_000,
    tramos: [{ nombre: 'Negro (en mano)', monto: 11_500_000 }, { nombre: 'Blanco (con cargas)', monto: 19_500_000 }],
    sellos: ['estimado'],
  })
  assert.equal(d.total, millones(31_000_000))
  assert.deepEqual(d.filas, [
    { nombre: 'Negro (en mano)', importe: '$ 11,50 M' },
    { nombre: 'Blanco (con cargas)', importe: '$ 19,50 M' },
  ])
  assert.deepEqual(d.notas, ['estimado'])
})

test('un mes parcial lleva sus sellos en el detalle', () => {
  const d = detalleDeColumna({ titulo: 'oct 26', total: 3_790_000, tramos: [{ nombre: 'Blanco', monto: 2_000_000 }], sellos: ['parcial', 'estimado'] })
  assert.deepEqual(d.notas, ['parcial', 'estimado'])
  assert.match(d.aria, /parcial/)
})

test('una barra sin dato dice «sin medir» y no inventa tramos ni un total de 0', () => {
  const d = detalleDeColumna({ titulo: 'nov 26', total: null, tramos: [{ nombre: 'Blanco', monto: 5 }], sinDato: 'sin medir' })
  assert.equal(d.total, null)
  assert.deepEqual(d.filas, [])
  assert.deepEqual(d.notas, ['sin medir'])
  assert.equal(d.aria, 'nov 26: sin medir')
})

test('un tramo sin medir se nombra, no se muestra como $ 0', () => {
  const d = detalleDeColumna({ titulo: 'ene 26', total: 100, tramos: [{ nombre: 'Subcontratos', monto: null }] })
  assert.equal(d.filas[0].importe, 'sin medir')
})

test('la descripción accesible repite el mes, el total y cada tramo', () => {
  const d = detalleDeColumna({ titulo: 'mar 26', total: 2_000_000, tramos: [{ nombre: 'A una obra', monto: 1_500_000 }, { nombre: 'Estructura', monto: 500_000 }] })
  assert.equal(d.aria, 'mar 26: total $ 2,00 M. A una obra $ 1,50 M. Estructura $ 0,50 M')
})
