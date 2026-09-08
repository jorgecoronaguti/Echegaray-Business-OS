import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notaDe } from './jornadaPorObraService.ts'

// LO QUE SE LEE BAJO EL NOMBRE EN LA GRILLA: la CATEGORÍA y nada más — la misma que marca Plantel
// (dueño, 08/09/2026). Ni rol ni oficio.
test('SÓLO LA CATEGORÍA, como en Plantel', () => {
  assert.equal(notaDe({ rol: 'integrante', persona_categoria: 'oficial', persona_especialidad: 'ALBAÑIL' }), 'oficial')
  assert.equal(notaDe({ rol: 'capataz', persona_categoria: 'oficial_especializado', persona_especialidad: 'MAQUINISTA' }), 'oficial especializado')
})

test('SIN CATEGORÍA NO SE INVENTA NADA: ni el oficio ni el rol la reemplazan', () => {
  assert.equal(notaDe({ rol: 'capataz', persona_categoria: null, persona_especialidad: 'ELECTRICISTA' }), null)
  assert.equal(notaDe({ rol: null, persona_categoria: '  ', persona_especialidad: null }), null)
})
