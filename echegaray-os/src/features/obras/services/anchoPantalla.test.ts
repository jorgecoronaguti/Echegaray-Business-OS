import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ANCHO_MINIMO_TABLA_MASIVA, ANCHO_TABLA_CRONOGRAMA, ANCHO_TABLA_CRONOGRAMA_TELEFONO, ANCHO_TELEFONO,
  anchoMinimoImpactoDotacion, anchoSimuladorDotacion, anchoTablaCronograma, esAngosto,
} from './anchoPantalla.ts'

test('390px es teléfono; 1024 y 1600 no', () => {
  assert.equal(esAngosto(390), true)
  assert.equal(esAngosto(ANCHO_TELEFONO - 1), true)
  assert.equal(esAngosto(ANCHO_TELEFONO), false)
  assert.equal(esAngosto(1024), false)
  assert.equal(esAngosto(1600), false)
})

test('cronograma: la tabla mide 340 en escritorio y deja más de la mitad al lienzo en el teléfono', () => {
  assert.equal(anchoTablaCronograma(1600), ANCHO_TABLA_CRONOGRAMA)
  assert.equal(anchoTablaCronograma(390), ANCHO_TABLA_CRONOGRAMA_TELEFONO)
  // 390 de ventana − 40 de aire − 2 de borde: el lienzo tiene que quedarse con la mitad o más.
  const util = 390 - 40 - 2
  assert.ok(util - anchoTablaCronograma(390) >= util / 2)
})

test('dotación: en el teléfono el simulador y el impacto ocupan todo el ancho, uno debajo del otro', () => {
  assert.equal(anchoSimuladorDotacion(1600), '428px')
  assert.equal(anchoMinimoImpactoDotacion(1600), '420px')
  assert.equal(anchoSimuladorDotacion(390), '100%')
  assert.equal(anchoMinimoImpactoDotacion(390), '0')
})

test('avance masivo: el mínimo de la grilla cubre sus columnas fijas y es más que un teléfono', () => {
  // 18 + 132 + 140 + 116 fijos + 5 gaps de 10 + 28 de aire = 484; las dos flexibles necesitan lugar.
  assert.ok(ANCHO_MINIMO_TABLA_MASIVA > 484)
  assert.ok(ANCHO_MINIMO_TABLA_MASIVA > 390)
})
