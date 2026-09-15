// LAS HUELLAS SE CORREN CON LA COLUMNA, Y SU FORMA SE RECALCULA CON LO RELEÍDO (14/09/2026).
import test from 'node:test'
import assert from 'node:assert/strict'
import { planDeCeldas, planDeFormato, correrRangoFormato, verificarAplicado, DESDE_COLUMNA } from './huellas-corrimiento.mjs'
import { huellaDe } from './huella-celda.mjs'

const h = (pestana, fila, col, valor) => ({ pestana, fila, col, valor, forma: 'x', huella: huellaDe(valor) ?? '' })

test('Compras corre desde la L (índice 11) y Cobranzas desde la H (7), en sus dos grafías', () => {
  assert.deepEqual({ ...DESDE_COLUMNA }, { Compras: 11, Cobranzas: 7, COBRANZAS: 7 })
  const plan = planDeCeldas([h('Compras', 4, 10, 'K'), h('Compras', 4, 11, 'L'), h('Cobranzas', 5, 6, 'G'), h('COBRANZAS', 5, 7, 'H'), h('CAJA', 1, 20, 'x')])
  assert.deepEqual(plan.mover.map((m) => `${m.pestana}:${m.colAntes}→${m.col}`), ['Compras:11→12', 'COBRANZAS:7→8'])
  assert.equal(plan.quedan, 3)
})

test('la huella nueva sale de la fórmula RELEÍDA en la posición nueva, no de la guardada', () => {
  const vieja = '=ARRAYFORMULA(IF($E$4:$E="";"";$O$4:$O))'
  const releida = '=ARRAYFORMULA(IF($E$4:$E="";"";$P$4:$P))'
  const plan = planDeCeldas([h('Compras', 4, 37, vieja)], (p, f, c) => (p === 'Compras' && f === 4 && c === 38 ? releida : null))
  assert.equal(plan.mover[0].huella, huellaDe(releida))
  assert.notEqual(plan.mover[0].huella, huellaDe(vieja), 'si la huella no cambia, la corrida siguiente leería la celda como editada')
  assert.equal(plan.mover[0].valor, releida)
})

test('una celda vacía al releer conserva la huella de antes: no se fabrica propiedad', () => {
  const plan = planDeCeldas([h('Compras', 9, 20, '=U9')], () => '')
  assert.equal(plan.mover[0].huella, huellaDe('=U9'))
  assert.equal(plan.sinContenido, 1)
})

test('los rangos de formato se corren: letras a la derecha y anchos por índice', () => {
  assert.equal(correrRangoFormato('AD4:AD3000', 11), 'AE4:AE3000')
  assert.equal(correrRangoFormato('K4:K10', 11), 'K4:K10')
  assert.equal(correrRangoFormato('COLUMNS:28-30', 11), 'COLUMNS:29-31')
  assert.equal(correrRangoFormato('COLUMNS:52-53', 7), 'COLUMNS:53-54')
  assert.equal(correrRangoFormato('COLUMNS:2-7', 7), 'COLUMNS:2-7')
  assert.equal(planDeFormato([{ pestana: 'Compras', rango_a1: 'AD4:AD3000', tipo: 'celda' }, { pestana: 'CAJA', rango_a1: 'AD1', tipo: 'celda' }]).length, 1)
})

test('el plan de formato se aplica sin chocar con la clave primaria (los rangos reales de Cobranzas)', () => {
  const filas = ['BA5:BA200', 'BB5:BB200', 'BC1:BC1', 'COLUMNS:52-53', 'COLUMNS:53-54', 'COLUMNS:54-55']
    .map((r) => ({ pestana: 'Cobranzas', rango_a1: r, tipo: r.startsWith('COLUMNS') ? 'ancho' : 'celda' }))
  const tabla = new Set(filas.map((f) => `${f.rango_a1}|${f.tipo}`))
  for (const p of planDeFormato(filas)) {
    const destino = `${p.rangoNuevo}|${p.tipo}`
    assert.ok(!tabla.has(destino), `choca: ${p.rango_a1} → ${p.rangoNuevo} con una fila que todavía no se movió`)
    tabla.delete(`${p.rango_a1}|${p.tipo}`)
    tabla.add(destino)
  }
  assert.equal(tabla.size, filas.length)
})

test('la verificación de lo aplicado detecta una huella que no quedó', () => {
  const plan = planDeCeldas([h('Compras', 4, 14, '=N4+M4')], () => '=O4+N4')
  const bien = plan.mover.map((m) => ({ pestana: m.pestana, fila: m.fila, col: m.col, huella: m.huella }))
  assert.deepEqual(verificarAplicado(plan, bien), [])
  assert.equal(verificarAplicado(plan, [{ ...bien[0], huella: 'otra' }]).length, 1)
  assert.equal(verificarAplicado(plan, []).length, 1)
})
