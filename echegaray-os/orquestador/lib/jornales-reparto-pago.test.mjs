// EL REPARTO DE LO QUE SE LE PAGA A CADA UNO: qué va por transferencia y qué en billetes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { repartoPersona, esElRepartoDeLaPlanilla } from './jornales-reparto-pago.mjs'


// ═══ CASTILLO CARLOS: BANCO VACÍO NO ES «FALTA EL DATO» (31/08) ═══
//
// Su fila real de «Obreros 26» (543): 55 h × $5.600 = $308.000, BANCO vacío, EFECTIVO $308.000,
// TOTAL $308.000. La planilla está diciendo que a esta persona NO se le transfiere nada. El OS leía
// el vacío como hueco, aplicaba el 50/50 y publicaba $154.000 por banco y $154.000 en mano.
const CASTILLO = { total: 308000, adelanto: 0, banco: 0, efectivoPlanilla: 308000, totalPlanilla: 308000 }
// Y su vecino de la misma planilla (fila 542), que SÍ tiene banco cargado y recibo confirmado.
const OCHOA = { total: 453600, adelanto: 0, banco: 67794.8, efectivoPlanilla: 385805, totalPlanilla: 453600 }

test('EL DEFECTO: con BANCO vacío y EFECTIVO = TOTAL, no se transfiere NADA', () => {
  const r = repartoPersona(CASTILLO)
  assert.equal(r.banco, 0, `publicó $${r.banco} por transferencia: la planilla dice que no se transfiere`)
  assert.equal(r.efectivo, 308000)
  assert.equal(r.bancoCalculado, false, 'no es un cálculo: es lo que declara la planilla')
  assert.equal(r.bancoDeclarado, true)
})

test('la fila de al lado, con banco cargado, no cambia', () => {
  const r = repartoPersona(OCHOA)
  assert.equal(r.banco, 67794.8)
  assert.equal(Math.round(r.efectivo), 385805)
  assert.equal(r.bancoCalculado, false)
})

test('cuando la planilla NO cierra, se sigue calculando el 50/50 — no se inventa un cero', () => {
  // Efectivo cargado a medias: 100.000 contra un total de 400.000. No declara nada.
  const r = repartoPersona({ total: 400000, banco: 0, efectivoPlanilla: 100000, totalPlanilla: 400000 })
  assert.equal(r.bancoCalculado, true)
  assert.equal(r.banco, 200000)
  // Y sin datos de planilla, el comportamiento de siempre.
  const s = repartoPersona({ total: 400000, banco: 0 })
  assert.equal(s.bancoCalculado, true)
  assert.equal(s.banco, 200000)
})

test('esElRepartoDeLaPlanilla: exige que los tres números existan y cierren', () => {
  assert.equal(esElRepartoDeLaPlanilla({ banco: 0, efectivoPlanilla: 308000, totalPlanilla: 308000 }), true)
  assert.equal(esElRepartoDeLaPlanilla({ banco: 0, efectivoPlanilla: 0, totalPlanilla: 308000 }), false)
  assert.equal(esElRepartoDeLaPlanilla({ banco: 0, efectivoPlanilla: 308000, totalPlanilla: 0 }), false)
  assert.equal(esElRepartoDeLaPlanilla({ banco: 0, efectivoPlanilla: 307000, totalPlanilla: 308000 }), false)
  assert.equal(esElRepartoDeLaPlanilla({}), false)
  // Un peso de diferencia por redondeo sí cierra.
  assert.equal(esElRepartoDeLaPlanilla({ banco: 67794.8, efectivoPlanilla: 385805, totalPlanilla: 453600 }), true)
})
