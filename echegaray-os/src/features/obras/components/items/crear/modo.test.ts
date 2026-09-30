import test from 'node:test'
import assert from 'node:assert/strict'
import { modoParaObra, type ModoEstructura } from './modo.ts'

const vacio: ModoEstructura = { crear: null, panel: null, act: null, sel: false, nuevo: null }

test('obra sin actividades y con permiso: el alta manual abre sola, sin ?nueva=1', () => {
  assert.equal(modoParaObra(vacio, 0, true, false).crear, 'mano')
})

test('quien no puede editar, o la obra archivada, conserva la pantalla C01', () => {
  assert.equal(modoParaObra(vacio, 0, false, false).crear, null)
  assert.equal(modoParaObra(vacio, 0, true, true).crear, null)
})

test('con trabajo cargado no se fuerza ningún modo', () => {
  assert.equal(modoParaObra(vacio, 3, true, false).crear, null)
})

test('un modo pedido (presupuesto) no se pisa', () => {
  assert.equal(modoParaObra({ ...vacio, crear: 'presupuesto' }, 0, true, false).crear, 'presupuesto')
})
