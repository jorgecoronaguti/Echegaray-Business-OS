import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectar, reescribir, resumen } from './columna-formula.mjs'

/** La columna A real de Cobranzas: autonumerada, con dos celdas pegadas a mano. */
const COBRANZAS_A = [
  { fila: 49, formula: '=IF(C49="";"";ROW()-4)', valor: '45' },
  { fila: 50, formula: null, valor: '47' },              // ← pegada
  { fila: 51, formula: '=IF(C51="";"";ROW()-4)', valor: '47' },
  { fila: 52, formula: '=IF(C52="";"";ROW()-4)', valor: '48' },
  { fila: 53, formula: '=IF(C53="";"";ROW()-4)', valor: '49' },
  { fila: 54, formula: null, valor: '47' },              // ← pegada
  { fila: 55, formula: '=IF(C55="";"";ROW()-4)', valor: '51' },
]

test('encuentra las dos celdas pisadas de Cobranzas', () => {
  const d = detectar(COBRANZAS_A)
  assert.deepEqual(d.pisadas.map((p) => p.fila), [50, 54])
  assert.equal(d.ambigua, false)
})

test('la fórmula que propone es la de ESA fila, no la del ejemplo', () => {
  const d = detectar(COBRANZAS_A)
  assert.equal(d.pisadas[0].deberia, '=IF(C50="";"";ROW()-4)')
  assert.equal(d.pisadas[1].deberia, '=IF(C54="";"";ROW()-4)')
})

test('ROW()-4 no se toca: el 4 es un desplazamiento, no una fila', () => {
  // Si el 4 se moviera, la numeración entera quedaría corrida y nadie lo notaría.
  assert.equal(reescribir('=IF(C51="";"";ROW()-4)', 51, 77), '=IF(C77="";"";ROW()-4)')
})

test('una referencia absoluta no se mueve', () => {
  assert.equal(reescribir('=M51/$M$5', 51, 60), '=M60/$M$5')
})

test('una celda vacía NO es un defecto', () => {
  // Es una fila sin usar. Marcarla llenaría el control de ruido y nadie lo miraría más.
  const d = detectar([...COBRANZAS_A, { fila: 56, formula: null, valor: '' }])
  assert.deepEqual(d.pisadas.map((p) => p.fila), [50, 54])
})

test('dos fórmulas conviviendo NO se reparan solas', () => {
  const mixta = [
    { fila: 5, formula: '=J5+K5-L5', valor: 1 },
    { fila: 6, formula: '=J6+K6-L6', valor: 1 },
    { fila: 7, formula: '=J7', valor: 1 },
    { fila: 8, formula: '=J8', valor: 1 },
    { fila: 9, formula: null, valor: 5 },
  ]
  const d = detectar(mixta)
  assert.equal(d.ambigua, true, 'elegir la más frecuente pisaría la otra regla')
  assert.match(resumen(d, 'Cobranzas!M'), /NO la reparo sola/)
})

test('una columna sin ninguna fórmula no aplica', () => {
  const d = detectar([{ fila: 5, formula: null, valor: 'ARCOR' }])
  assert.equal(d.canonica, null)
  assert.deepEqual(d.pisadas, [])
  assert.match(resumen(d, 'Cobranzas!G'), /no aplica/)
})

test('una columna sana se reporta sana', () => {
  const d = detectar(COBRANZAS_A.filter((c) => c.formula))
  assert.equal(d.pisadas.length, 0)
  assert.match(resumen(d, 'Cobranzas!A'), /✓/)
})
