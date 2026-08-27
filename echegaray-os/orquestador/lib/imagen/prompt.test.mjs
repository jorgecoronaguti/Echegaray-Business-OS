// EL PROMPT DE UNA IMAGEN — y lo que NO puede salir de la empresa adentro de él.
//
// La auditoría del 27/08 lo encontró: el filtro de importes cubría `contexto.datos[]` y el prompt lo
// escriben `pedido` y `objetivo`, que son texto libre y obligatorio. Cada test de acá es una forma
// real de escribir plata que se estaba yendo a un proveedor sin contrato.
import test from 'node:test'
import assert from 'node:assert/strict'
import { construirPrompt, tacharDatos } from './prompt.mjs'

test('tacharDatos deja el texto y saca el número', () => {
  const r = tacharDatos('la obra de $1.250.000')
  assert.ok(!r.texto.includes('1.250.000'))
  assert.ok(r.texto.includes('la obra de'))
  assert.equal(r.tachado, true)
  assert.equal(tacharDatos('una losa de hormigón').tachado, false)
})

test('un importe escrito en el PEDIDO no sale de la empresa', () => {
  const r = construirPrompt({ tipo: 'comercial', pedido: 'portada para la propuesta de $48.500.000 a Quattropani' })
  assert.ok(!r.prompt.includes('48.500.000'), r.prompt)
  assert.equal(r.datos_tachados, true)
  assert.ok(r.prompt.includes('Quattropani'), 'el nombre del comitente sí puede viajar: es el sujeto')
})

test('también se tacha en el OBJETIVO y en las formas cortas del importe', () => {
  const r = construirPrompt({ tipo: 'slide', pedido: 'una obra', objetivo: 'cerrar la venta de U$S 63.000' })
  assert.ok(!r.prompt.includes('63.000'))
  const c = construirPrompt({ tipo: 'slide', pedido: 'lámina del contrato de $48,5M' })
  assert.ok(!c.prompt.includes('48,5'))
})

test('un CUIT en el texto libre tampoco viaja', () => {
  const r = construirPrompt({ tipo: 'slide', pedido: 'ficha del proveedor 30-71754087-1' })
  assert.ok(!r.prompt.includes('30-71754087-1'))
  assert.equal(r.datos_tachados, true)
})

test('un pedido sin datos no se toca y no dice que tachó nada', () => {
  const r = construirPrompt({ tipo: 'slide', pedido: 'obreros encofrando una losa de hormigón' })
  assert.ok(r.prompt.includes('obreros encofrando una losa de hormigón'))
  assert.equal(r.datos_tachados, false)
})
