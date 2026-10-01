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

// ═══ UNA SOLA TABLA (dueño, 01/10/2026, Quiroga Sebastián: «Recibo: $7.561/h» y «Plataforma: $7.420/h») ═══
// Los dos renglones salen de `convenio_escala`: misma categoría ⇒ mismo número. Revertir `escala` en
// `categoriasDeLaFila` devuelve los dos números de tablas distintas y estos tests se ponen rojos.
const SEP = { valorHora: 7561, desde: '2026-09-01', fuente: 'recibos Q1-09/2026' }
const AGO_MEDIO = { valorHora: 5866, desde: '2026-08-01', fuente: 'uocra_escala' }

test('MISMA CATEGORÍA, MISMO $/H: el recibo de otra tabla (7.420) no se mezcla con la escala', () => {
  const c = categoriasDeLaFila({
    plataforma: 'Oficial especializado', pisoPlataforma: 7420, categoriaRecibo: 'OFICIAL ESPECIALIZADO', valorHoraRecibo: 7420,
    periodoRecibo: 'Q1-09/2026', estado: 'recibo', escala: { recibo: SEP, plataforma: SEP },
  })
  assert.equal(c.recibo, 'Recibo: Oficial especializado · $7.561/h')
  assert.equal(c.plataforma, 'Plataforma: Oficial especializado · $7.561/h')
  assert.equal(c.coinciden, true)
  assert.match(c.titulo, /rige desde el 01\/09\/2026/)
})

test('CATEGORÍAS DISTINTAS: cada renglón con la escala de SU categoría, y no coinciden', () => {
  const c = categoriasDeLaFila({
    plataforma: 'Ayudante', pisoPlataforma: 5399, categoriaRecibo: 'OFICIAL ESPECIALIZADO', valorHoraRecibo: 1,
    periodoRecibo: 'Q1-09/2026', estado: 'recibo', escala: { recibo: SEP, plataforma: { valorHora: 5502, desde: '2026-09-01', fuente: 'x' } },
  })
  assert.equal(c.recibo, 'Recibo: Oficial especializado · $7.561/h')
  assert.equal(c.plataforma, 'Plataforma: Ayudante · $5.502/h')
  assert.equal(c.coinciden, false)
})

test('SIN FILA DE ESCALA PARA LA CATEGORÍA DEL RECIBO: «—/h», no el valor de otra tabla', () => {
  const c = categoriasDeLaFila({
    plataforma: 'Oficial', pisoPlataforma: 6348, categoriaRecibo: 'OFICIAL', valorHoraRecibo: 6468,
    periodoRecibo: 'Q1-09/2026', estado: 'recibo', escala: { recibo: null, plataforma: { valorHora: 6468, desde: '2026-09-01', fuente: 'x' } },
  })
  assert.equal(c.recibo, 'Recibo: Oficial · —/h')
  assert.equal(c.coinciden, false)
})

test('MEDIO OFICIAL SIN TRAMO DE SEPTIEMBRE: muestra la última fila existente con su fecha', () => {
  const c = categoriasDeLaFila({
    plataforma: 'Medio oficial', pisoPlataforma: null, categoriaRecibo: 'MEDIO OFICIAL', valorHoraRecibo: null,
    periodoRecibo: 'Q1-09/2026', estado: 'estimado', escala: { recibo: AGO_MEDIO, plataforma: AGO_MEDIO },
  })
  assert.equal(c.recibo, 'Recibo: Medio oficial · $5.866/h')
  assert.equal(c.coinciden, true)
  assert.match(c.titulo, /rige desde el 01\/08\/2026/)
})
