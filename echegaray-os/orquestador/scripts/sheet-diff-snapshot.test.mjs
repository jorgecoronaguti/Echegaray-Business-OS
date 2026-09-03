import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffGrillas, sospechosas, lineaResumen } from './sheet-diff-snapshot.mjs'
import { celdasQueEscribioElOs, textoDe } from './sheet-huellas-sembrar.mjs'

const c = (f, v) => ({ f, v })

test('diffGrillas: las seis categorías, cada una donde va', () => {
  const antes = [[c(null, 'hola'), c('=SUM(A1:A2)', '3'), c('=A1', '1'), c(null, '100'), c(null, ''), c(null, 'igual')]]
  const ahora = [[c(null, ''), c(null, '3'), c('=A2', '2'), c('=B1', '100'), c(null, 'nueva'), c(null, 'igual')]]
  const d = diffGrillas(antes, ahora)
  assert.deepEqual(d.borradas.map((x) => x.ref), ['A1'])
  assert.deepEqual(d.formulaAValor.map((x) => x.ref), ['B1'])
  assert.deepEqual(d.formulaCambiada.map((x) => x.ref), ['C1'])
  assert.deepEqual(d.valorAFormula.map((x) => x.ref), ['D1'])
  assert.deepEqual(d.nuevas.map((x) => x.ref), ['E1'])
  assert.deepEqual(d.valorCambiado, [], 'F1 no cambió: no puede aparecer en ningún lado')
  assert.equal(sospechosas(d), 3)
})

test('diffGrillas: dos grillas idénticas no producen una sola diferencia', () => {
  const g = [[c('=A1', '1'), c(null, 'x')], [c(null, '5'), c(null, '')]]
  const d = diffGrillas(g, g.map((f) => f.map((x) => ({ ...x }))))
  assert.equal(Object.values(d).reduce((n, v) => n + v.length, 0), 0)
})

test('lineaResumen marca con ⚠ sólo lo sospechoso', () => {
  const limpio = diffGrillas([[c(null, '1')]], [[c(null, '2')]])
  assert.equal(/⚠/.test(lineaResumen('CAJA', limpio)), false)
  const roto = diffGrillas([[c(null, '1')]], [[c(null, '')]])
  assert.match(lineaResumen('CAJA', roto), /borradas=1.*⚠/)
})

test('celdasQueEscribioElOs: sólo lo que CAMBIÓ y hoy tiene contenido', () => {
  const antes = [[c(null, 'a'), c(null, 'b'), c(null, '')]]
  const ahora = [[c(null, 'a'), c(null, 'B NUEVO'), c(null, 'apareció')]]
  const r = celdasQueEscribioElOs(antes, ahora)
  assert.deepEqual(r.map((x) => [x.fila, x.col, x.valor]), [[1, 1, 'B NUEVO'], [1, 2, 'apareció']])
})

test('celdasQueEscribioElOs: lo que NO cambió no se reclama — podría ser del dueño', () => {
  const g = [[c(null, 'igual'), c('=SUM(A1)', '3')]]
  assert.deepEqual(celdasQueEscribioElOs(g, g.map((f) => f.map((x) => ({ ...x })))), [])
})

test('celdasQueEscribioElOs: una celda que quedó VACÍA no se siembra', () => {
  const r = celdasQueEscribioElOs([[c(null, 'tenía algo')]], [[c(null, '')]])
  assert.deepEqual(r, [], 'sembrar una huella sobre una celda vacía la marcaría como borrada por el dueño')
})

test('textoDe: la fórmula gana sobre el valor renderizado', () => {
  assert.equal(textoDe({ f: '=A1', v: '5' }), '=A1')
  assert.equal(textoDe({ f: null, v: '5' }), '5')
  assert.equal(textoDe(null), '')
})
