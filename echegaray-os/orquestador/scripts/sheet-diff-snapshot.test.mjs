import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffGrillas, sospechosas, lineaResumen } from './sheet-diff-snapshot.mjs'
import { planDeSiembra, textoDe, TOPE_SIN_HUELLA } from './sheet-huellas-sembrar.mjs'

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

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA SIEMBRA — la evidencia es el grid que el OS selló, no el diff de snapshots
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// La primera versión sembraba lo que hubiera CAMBIADO entre el snapshot pre-corrida y la hoja viva.
// Medido contra el archivo real: 1 huella en todo el Sheet, porque los generadores son idempotentes y
// reescriben el mismo valor. Era la evidencia equivocada. `sheet_tab_firma.grid` es lo que el OS dejó
// escrito de verdad, releído con render FORMULA después de cada escritura.

test('planDeSiembra: siembra lo que el OS dejó y hoy sigue igual', () => {
  const sellado = [['Proveedor', 'Saldo'], ['Acindar', '500000']]
  const vivo = [['Proveedor', 'Saldo'], ['Acindar', '500000']]
  const p = planDeSiembra(sellado, vivo)
  assert.equal(p.sembrar.length, 4)
  assert.deepEqual(p.sembrar[0], { fila: 1, col: 0, valor: 'Proveedor' })
  assert.equal(p.sinHuella.length, 0)
})

test('planDeSiembra: lo que el dueño editó DESPUÉS del sello no se siembra', () => {
  const sellado = [['Proveedor', 'Saldo'], ['Acindar', '500000']]
  const vivo = [['Proveedor', 'Saldo'], ['Acindar', '999999']]
  const p = planDeSiembra(sellado, vivo)
  assert.equal(p.editadas, 1)
  assert.equal(p.sembrar.some((c) => c.fila === 2 && c.col === 1), false,
    'sembrar esa celda le daría al OS permiso para pisar la corrección del dueño')
  assert.ok(p.sinHuella.some((c) => c.fila === 2 && c.col === 1), 'y queda contada como sin huella: es del dueño')
})

test('planDeSiembra: una celda que NUNCA estuvo en lo sellado es del dueño', () => {
  const p = planDeSiembra([['Proveedor', '']], [['Proveedor', 'NOTA MÍA']])
  assert.equal(p.ajenas, 1)
  assert.equal(p.sembrar.length, 1, 'sólo la que sí estaba sellada')
})

test('planDeSiembra: el locale de la fórmula no la convierte en una edición', () => {
  // El OS sella el readback (con `;`); si el grid viejo tuviera `,` no puede leerse como edición.
  const p = planDeSiembra([['=SUM(A1,A2)']], [['=SUM(A1;A2)']])
  assert.equal(p.editadas, 0)
  assert.equal(p.sembrar.length, 1)
})

test('planDeSiembra: lo que YA tiene huella no se toca — el registro manda sobre la deducción', () => {
  const g = [['a', 'b']]
  const p = planDeSiembra(g, g, (fila, col) => fila === 1 && col === 0)
  assert.deepEqual(p.sembrar.map((c) => c.col), [1])
})

test('planDeSiembra: la ventana del generador es el rectángulo de lo que el OS dejó escrito', () => {
  const sellado = [[], [], ['', 'x', 'y']]
  const vivo = [[], [], ['tuyo', 'x', 'y']]
  const p = planDeSiembra(sellado, vivo)
  assert.deepEqual(p.ventana, { fila0: 3, col0: 1, filaFin: 3, colFin: 2 })
  // A3 tiene contenido y está FUERA de la ventana: no cuenta para el criterio de aceptación.
  assert.equal(p.sinHuella.length, 0)
})

test('el tope del criterio de aceptación es explícito y chico', () => {
  assert.equal(TOPE_SIN_HUELLA, 20)
})

test('textoDe: la fórmula gana sobre el valor renderizado', () => {
  assert.equal(textoDe({ f: '=A1', v: '5' }), '=A1')
  assert.equal(textoDe({ f: null, v: '5' }), '5')
  assert.equal(textoDe(null), '')
})
