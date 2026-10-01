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

// RECATEGORIZADO (dueño 01/10/2026, captura de Quiroga: «Recibo: Ayudante · $7.561/h»): el $/h ya era el de la
// categoría nueva y la etiqueta seguía con la vieja. La tarjeta dice la nueva, y el title cuenta la anterior.
test('RECATEGORIZADO: el renglón del recibo dice la categoría nueva, y el title la anterior y de dónde sale el $/h', () => {
  const c = categoriasDeLaFila({
    plataforma: 'Oficial especializado', pisoPlataforma: 7420, categoriaRecibo: 'Oficial especializado', valorHoraRecibo: 7561,
    periodoRecibo: 'Q1-09/2026', estado: 'estimado', recategorizadaDesde: { categoria: 'AYUDANTE', periodo: 'Q1-09/2026' },
  })
  assert.equal(c.recibo, 'Recibo: Oficial especializado · $7.561/h')
  assert.match(c.titulo, /Recategorizado: su último recibo \(1ª sep-26\) todavía decía Ayudante/)
  assert.match(c.titulo, /\$7\.561\/h es lo que el estudio pagó por Oficial especializado/)
  assert.doesNotMatch(c.titulo, /último real; el de este período no llegó\): Oficial especializado/)
})
