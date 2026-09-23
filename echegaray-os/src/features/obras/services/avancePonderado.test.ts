import test from 'node:test'
import assert from 'node:assert/strict'
import { bajadaAvance, cifraAvance, costoTeorico, diaHabil, rotuloHistoria, type AvancePonderado } from './avancePonderado.ts'

const base: AvancePonderado = {
  obra_id: 'x', metodo: 'costo_mo', avance_pct: 42.5, costo_mo_total: 7400000, costo_teorico: 3145000,
  n_historias: 5, n_historias_sin_costo: 0, pct_sin_peso: 0, n_items_medidos: 12, n_items: 40,
}

test('la cifra del avance y su bajada dicen el método y cuántos ítems se midieron', () => {
  assert.equal(cifraAvance(base), '42,5 %')
  assert.equal(bajadaAvance(base), 'ponderado por costo de MO · 12 de 40 ítems medidos')
  assert.equal(bajadaAvance({ ...base, metodo: 'parejo' }), 'parejo entre historias · 12 de 40 ítems medidos')
})

test('NULL nunca es 0: sin estructura no hay cifra, y sin avance tampoco', () => {
  assert.equal(cifraAvance(null), null)
  assert.equal(cifraAvance({ ...base, n_historias: 0 }), null)
  assert.equal(bajadaAvance({ ...base, n_historias: 0 }), 'sin estructura')
  assert.equal(cifraAvance({ ...base, avance_pct: null }), null)
})

test('costo teórico: «$X de $Y de MO», y las historias sin costo se dicen, no se esconden', () => {
  assert.deepEqual(costoTeorico(base), { cifra: '$ 3.145.000 de $ 7.400.000 de MO', bajada: 'según el avance ponderado' })
  assert.deepEqual(costoTeorico({ ...base, n_historias_sin_costo: 2 }),
    { cifra: '$ 3.145.000 de $ 7.400.000 de MO', bajada: '2 historias sin costo de MO · no pesan' })
  assert.deepEqual(costoTeorico({ ...base, n_historias_sin_costo: 1 }).bajada, '1 historia sin costo de MO · no pesan')
  assert.deepEqual(costoTeorico({ ...base, costo_mo_total: null, costo_teorico: null, n_historias_sin_costo: 5 }),
    { cifra: null, bajada: '5 de 5 historias sin costo de MO' })
  assert.deepEqual(costoTeorico(null), { cifra: null, bajada: 'sin estructura' })
})

test('día hábil A de B, y las dos faltas con su palabra', () => {
  assert.equal(diaHabil({ obra_id: 'x', dia_habil_actual: 23, dias_habiles_plan: 60 }), 'día hábil 23 de 60')
  assert.equal(diaHabil({ obra_id: 'x', dia_habil_actual: 23, dias_habiles_plan: null }), 'día hábil 23 · sin plan')
  assert.equal(diaHabil({ obra_id: 'x', dia_habil_actual: null, dias_habiles_plan: 60 }), 'sin inicio real')
  assert.equal(diaHabil(null), 'sin inicio real')
})

test('el rótulo de la historia: costo y peso en mono, o «sin costo de MO · no pesa» en warn', () => {
  assert.deepEqual(rotuloHistoria({ costo_mo: 1200000, peso: 0.162 }), { texto: '$ 1.200.000 · 16,2 %', tono: 'normal' })
  assert.deepEqual(rotuloHistoria({ costo_mo: null, peso: null }), { texto: 'sin costo de MO · no pesa', tono: 'warn' })
})
