import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notaDe } from './jornadaPorObraService.ts'

// LO QUE SE LEE BAJO EL NOMBRE EN LA GRILLA. El dueño (08/09/2026): la categoría es la del recibo de
// sueldo y tiene que verse; el oficio acompaña.
test('CATEGORÍA PRIMERO, OFICIO DESPUÉS', () => {
  assert.equal(notaDe({ rol: 'integrante', persona_categoria: 'oficial', persona_especialidad: 'ALBAÑIL' }), 'oficial · albañil')
  assert.equal(notaDe({ rol: null, persona_categoria: 'oficial_especializado', persona_especialidad: 'MAQUINISTA' }), 'oficial especializado · maquinista')
})

test('SIN OFICIO QUEDA LA CATEGORÍA; SIN CATEGORÍA QUEDA EL OFICIO; SIN NADA, NULL', () => {
  assert.equal(notaDe({ rol: 'operario', persona_categoria: 'ayudante', persona_especialidad: null }), 'ayudante')
  assert.equal(notaDe({ rol: null, persona_categoria: null, persona_especialidad: 'ELECTRICISTA' }), 'electricista')
  assert.equal(notaDe({ rol: null, persona_categoria: '', persona_especialidad: '  ' }), null)
})

test('UN ROL NO GENÉRICO MANDA SOBRE TODO (capataz, encargado…)', () => {
  assert.equal(notaDe({ rol: 'capataz', persona_categoria: 'oficial', persona_especialidad: 'ALBAÑIL' }), 'capataz')
})
