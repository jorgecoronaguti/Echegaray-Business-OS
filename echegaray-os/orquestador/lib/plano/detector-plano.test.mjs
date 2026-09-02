// EL DETECTOR DE PLANOS Y LA OBRA DEL RÓTULO — puro, bidireccional, sin modelo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esPlanoAdjunto, obraDeNombreDeArchivo } from './detector-plano.mjs'

test('el nombre del archivo clasifica: planos reales del dueño → sí', () => {
  assert.equal(esPlanoAdjunto({ nombre: 'Plano de Estructura.pdf' }), true)
  assert.equal(esPlanoAdjunto({ nombre: 'Estructura San Francisco del Monte Entrepiso.pdf' }), true)
  assert.equal(esPlanoAdjunto({ nombre: 'quattropani-fundaciones-rev2.pdf' }), true)
  assert.equal(esPlanoAdjunto({ nombre: 'Lámina E-02 arriostramientos.pdf' }), true)
})

test('papeles administrativos → no, gane lo que gane el resto del nombre', () => {
  assert.equal(esPlanoAdjunto({ nombre: 'Factura A 0003-00012345.pdf' }), false)
  assert.equal(esPlanoAdjunto({ nombre: 'Presupuesto estructura metálica.pdf' }), false)
  assert.equal(esPlanoAdjunto({ nombre: 'Extracto agosto.pdf' }), false)
  assert.equal(esPlanoAdjunto({ nombre: 'Recibo de sueldo 08-2026.pdf' }), false)
  assert.equal(esPlanoAdjunto({ nombre: 'Contrato de obra firmado.pdf' }), false)
})

test('nombre mudo + vocabulario de lámina en el texto (≥3 señales) → sí; texto de carta → no', () => {
  const lamina = 'PLANTA ALTA escala 1:100 · cotas en metros · vigas VF y columnas C1 · hormigón H-21'
  assert.equal(esPlanoAdjunto({ nombre: 'doc-2026-091.pdf', texto: lamina }), true)
  assert.equal(esPlanoAdjunto({ nombre: 'doc-2026-091.pdf', texto: 'Estimados, adjunto lo conversado. Saludos.' }), false)
})

test('la obra sale del rótulo: se quita el rubro, quedan el nombre y sus conectores internos', () => {
  assert.equal(obraDeNombreDeArchivo('Estructura San Francisco del Monte Entrepiso.pdf'), 'San Francisco del Monte')
  assert.equal(obraDeNombreDeArchivo('quattropani-fundaciones-rev2.pdf'), 'quattropani')
  assert.equal(obraDeNombreDeArchivo('Plano municipal La Estrella planta baja.pdf'), 'La Estrella')
})

test('rótulo sin obra → null: se pregunta, no se adivina', () => {
  assert.equal(obraDeNombreDeArchivo('Plano de Estructura.pdf'), null)
  assert.equal(obraDeNombreDeArchivo('planta-fundaciones.txt'), null)
  assert.equal(obraDeNombreDeArchivo('E-02.pdf'), null)
  assert.equal(obraDeNombreDeArchivo(''), null)
})
