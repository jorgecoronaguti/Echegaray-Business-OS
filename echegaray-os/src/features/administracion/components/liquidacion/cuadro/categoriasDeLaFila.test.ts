import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categoriasDeLaFila, legible, periodoCorto } from './categoriasDeLaFila.ts'

test('LAS DOS CATEGORÍAS CON SU $/H, Y SE DICE QUE NO COINCIDEN', () => {
  const c = categoriasDeLaFila({ plataforma: 'Ayudante', pisoPlataforma: 5399, categoriaRecibo: 'OFICIAL', valorHoraRecibo: 6348, periodoRecibo: 'Q2-08/2026', estado: 'estimado' })
  assert.equal(c.recibo, 'Recibo: Oficial · $6.348/h')
  assert.equal(c.plataforma, 'Plataforma: Ayudante · $5.399/h')
  assert.equal(c.coinciden, false)
  assert.match(c.titulo, /Recibo 2ª ago-26 \(último real/)
  assert.match(c.titulo, /NO coinciden/)
})

test('CUANDO COINCIDEN, LO DICE', () => {
  const c = categoriasDeLaFila({ plataforma: 'Oficial', pisoPlataforma: 6348, categoriaRecibo: 'OFICIAL', valorHoraRecibo: 6348, periodoRecibo: 'Q1-09/2026', estado: 'recibo' })
  assert.equal(c.coinciden, true)
  assert.match(c.titulo, /Recibo 1ª sep-26: Oficial · \$6\.348\/h/)
  assert.match(c.titulo, /Coinciden\./)
})

test('SIN RECIBO NUNCA: SE DICE, Y EL PISO DE PLATAFORMA QUEDA A LA VISTA', () => {
  const c = categoriasDeLaFila({ plataforma: 'Oficial', pisoPlataforma: 6348, categoriaRecibo: null, valorHoraRecibo: 6348, periodoRecibo: null, estado: 'estimado' })
  assert.equal(c.recibo, 'Recibo: sin recibo todavía')
  assert.equal(c.plataforma, 'Plataforma: Oficial · $6.348/h')
  assert.equal(c.coinciden, false)
})

test('RÓTULOS: la categoría impresa se vuelve legible y el período corto', () => {
  assert.equal(legible('OFICIAL ESPECIALIZADO'), 'Oficial especializado')
  assert.equal(legible(''), null)
  assert.equal(periodoCorto('Q2-08/2026'), '2ª ago-26')
  assert.equal(periodoCorto('FINAL-08/2026'), 'FINAL-08/2026')
})
