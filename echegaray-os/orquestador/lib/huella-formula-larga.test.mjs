// UNA FÓRMULA MÁS LARGA QUE EL SELLO NO PUEDE QUEDAR CONGELADA PARA SIEMPRE.
//
// `sheet_huella_celda.valor` se guarda cortado a `LARGO_FORMA` (300). Antes de este arreglo, toda
// fórmula más larga se declaraba «editada por el dueño» en la corrida siguiente a la que la
// escribió, y el generador no la podía volver a tocar ni para corregir un error.
//
// Medido en «Impuestos y Financieros» el 03/09/2026: el cuadro de IVA saltaba entre 101 y 105 filas
// en corridas consecutivas y los rótulos quedaban tres filas corridos respecto de sus valores.

import test from 'node:test'
import assert from 'node:assert/strict'
import { editadaPorElDueno, LARGO_FORMA } from './huella-forma.mjs'

const larga = (n, cola = '') => `=SUMPRODUCT(${'A'.repeat(n)}${cola})`
const sellar = (f) => String(f).slice(0, LARGO_FORMA)

test('una fórmula LARGA se reconoce a sí misma aunque el sello esté cortado', () => {
  const f = larga(500)
  assert.equal(f.length > LARGO_FORMA, true, 'el caso sólo existe si de verdad supera el tope')
  assert.equal(editadaPorElDueno(f, sellar(f)), false,
    'la celda es la MISMA: declararla editada la congela para siempre')
})

test('un cambio del dueño DENTRO del tramo sellado sí se ve', () => {
  const f = larga(500)
  const suya = f.replace('SUMPRODUCT', 'SUMIFS')
  assert.equal(editadaPorElDueno(suya, sellar(f)), true)
})

test('una fórmula corta sigue comparándose entera', () => {
  assert.equal(editadaPorElDueno('=SUM(A1:A9)', '=SUM(A1:A9)'), false)
  assert.equal(editadaPorElDueno('=SUM(A1:A9)', '=MAX(A1:A9)'), true)
})

test('los números y el locale siguen sin contar como edición', () => {
  const a = '=SUM(A1;B1)*1,05'
  const b = '=SUM(A1,B1)*1.05'
  assert.equal(editadaPorElDueno(a, b), false, 'mismo esqueleto en dos locales')
})

test('un número editado a mano sigue detectándose', () => {
  assert.equal(editadaPorElDueno('750000', '500000'), true)
})
