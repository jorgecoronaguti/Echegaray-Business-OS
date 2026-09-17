import test from 'node:test'
import assert from 'node:assert/strict'
import { scrollParaMostrar } from './desplazarSolapa.ts'

test('D7 · a 390 la solapa activa del final queda fuera: se corre la barra hasta mostrarla', () => {
  // Barra visible de 237px con Analíticas empezando en 300: estaba del otro lado del borde.
  assert.equal(scrollParaMostrar({ ancho: 237, scroll: 0, izquierda: 300, anchoSolapa: 90 }), 300 + 90 - 237 + 16)
})

test('D7 · si la activa ya se ve entera no se mueve nada (Administración, Obras en escritorio)', () => {
  assert.equal(scrollParaMostrar({ ancho: 237, scroll: 0, izquierda: 0, anchoSolapa: 110 }), null)
  assert.equal(scrollParaMostrar({ ancho: 1000, scroll: 0, izquierda: 300, anchoSolapa: 90 }), null)
})

test('D7 · si quedó a la izquierda del borde, vuelve sin pasar de cero', () => {
  assert.equal(scrollParaMostrar({ ancho: 237, scroll: 200, izquierda: 10, anchoSolapa: 90 }), 0)
})
