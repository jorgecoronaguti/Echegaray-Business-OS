// EL CFO EXPLORA TODO EL ESPACIO (F5) — las posturas avanzadas COMPITEN, la sensibilidad INFORMA.
//
// Verifica que el diseñador propone las posturas avanzadas SÓLO cuando la data las hace reales, que cada
// una es una estrategia ejecutable completa que entra al ranking, y que la sensibilidad de cobros vive
// FUERA del ranking como recomendación. Todo con datos sintéticos — no toca ninguna fuente real.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { disenarEstrategias } from './estrategias-tesoreria.mjs'
import { posturasCondicionales, sensibilidadCobros } from './estrategias-tesoreria-avanzadas.mjs'

const HOY = new Date(2026, 6, 24)
const dia = (fecha, movimientos) => ({ fecha, saldo_inicial: 0, movimientos })
const ymd = (n) => `2026-07-${String(n).padStart(2, '0')}`
const conVacios = (primer, hastaDia) => [primer, ...Array.from({ length: hastaDia - 24 }, (_, i) => dia(ymd(25 + i), []))]
const g = (est, k) => est.generadas.find((e) => e.clave === k)
const puesto = (est, k) => est.comparacion.ranking.findIndex((r) => r.clave === k)
const CAMPOS = ['clave', 'nombre', 'objetivo', 'razonamiento', 'palancas', 'metricas', 'beneficios', 'riesgos', 'impacto', 'plan', 'alternativas_descartadas']
const DIMS = ['caja', 'liquidez', 'costo_financiero', 'obras', 'proveedores', 'clientes', 'obligaciones']

function esEstrategiaCompleta(e) {
  for (const c of CAMPOS) assert.ok(c in e, `${e.clave} debe declarar "${c}"`)
  assert.ok(e.beneficios.length > 0 && e.riesgos.length > 0)
  for (const d of DIMS) assert.ok(d in e.impacto, `${e.clave} debe declarar impacto sobre "${d}"`)
  assert.ok(Array.isArray(e.plan.acciones))
}

// ── PROTEGER OBRA ──────────────────────────────────────────────────────────────
test('proteger_obra: se propone con ≥2 obras en disputa; es estrategia completa y compite en el ranking', () => {
  const dias = [dia('2026-07-24', [
    { tipo: 'egreso', monto: 800000, proveedor: 'ProvA', obra: 'ObraA' },
    { tipo: 'egreso', monto: 900000, proveedor: 'ProvB', obra: 'ObraB' },
  ])]
  const { estrategias } = disenarEstrategias({ dias, cajaInicial: 1000000, hoy: HOY })
  const p = g(estrategias, 'proteger_obra')
  assert.ok(p, 'debe generar la postura de proteger la obra de mayor exposición')
  assert.equal(p.palancas.priorizar_obra, 'ObraB', 'protege la de mayor exposición (900k)')
  esEstrategiaCompleta(p)
  assert.ok(puesto(estrategias, 'proteger_obra') >= 0, 'entra al ranking como estrategia ejecutable')
})

test('proteger_obra: NO se propone con una sola obra (no hay disputa que resolver)', () => {
  const dias = [dia('2026-07-24', [{ tipo: 'egreso', monto: 800000, proveedor: 'ProvA', obra: 'ObraUnica' }])]
  const cond = posturasCondicionales({ dias, cajaInicial: 100000, hoy: HOY })
  assert.ok(!cond.some((p) => p.clave === 'proteger_obra'))
})

// ── DESCUENTO DE CHEQUE ────────────────────────────────────────────────────────
test('descuento_cheque: se propone con tasa + bache; deja la línea en 0 y puede GANAR por costo en un horizonte largo', () => {
  const dias = conVacios(dia('2026-07-24', [{ tipo: 'egreso', monto: 5000000, proveedor: 'Gruas', vencida: true }]), 53) // ~30 días de línea abierta
  const paramsFin = { tasaDescuentoChequeTNA: 0.4 }
  const { estrategias } = disenarEstrategias({ dias, cajaInicial: 1000000, hoy: HOY, paramsFin })
  const cheque = g(estrategias, 'descuento_cheque')
  assert.ok(cheque, 'con tasa de descuento y un bache, la postura existe')
  esEstrategiaCompleta(cheque)
  assert.equal(cheque.metricas.linea_maxima, 0, 'descontar el cheque deja la línea en cero')
  assert.ok(cheque.metricas.costo_financiero < g(estrategias, 'costo_minimo').metricas.costo_financiero, 'sobre 30 días, el costo único del cheque es menor que el descubierto acumulado')
  assert.ok(puesto(estrategias, 'descuento_cheque') < puesto(estrategias, 'costo_minimo'), 'el cheque rankea por encima del descubierto')
})

test('descuento_cheque: NO se propone si no se conoce la tasa (no inventa el costo)', () => {
  const dias = [dia('2026-07-24', [{ tipo: 'egreso', monto: 5000000, proveedor: 'Gruas', vencida: true }])]
  const cond = posturasCondicionales({ dias, cajaInicial: 1000000, hoy: HOY })
  assert.ok(!cond.some((p) => p.clave === 'descuento_cheque'))
})

// ── DIVISIÓN DE PAGO ───────────────────────────────────────────────────────────
test('division_pago: se propone cuando aparece un pago parcial; honra parte y negocia el resto sin costo', () => {
  const dias = [dia('2026-07-24', [{ tipo: 'egreso', monto: 800000, proveedor: 'ProvX' }])]
  const { estrategias } = disenarEstrategias({ dias, cajaInicial: 500000, hoy: HOY })
  const d = g(estrategias, 'division_pago')
  assert.ok(d, 'con caja que cubre parte, la división es una opción real')
  esEstrategiaCompleta(d)
  assert.ok(d.plan.acciones.some((a) => a.tipo === 'pagar' && /parcial/i.test(a.descripcion)), 'su plan paga parcial')
  assert.equal(d.metricas.costo_financiero, 0, 'dividir no usa la línea')
})

// ── NEGOCIAR PLAZO ─────────────────────────────────────────────────────────────
test('negociar_plazo: se propone con un postergado + un cobro posterior; el egreso se paga en la nueva fecha, no se posterga', () => {
  const dias = [
    dia('2026-07-24', [{ tipo: 'egreso', monto: 800000, proveedor: 'ProvX' }]),
    dia('2026-07-26', [{ tipo: 'ingreso', monto: 2000000, cliente: 'A' }]),
  ]
  const { estrategias } = disenarEstrategias({ dias, cajaInicial: 0, hoy: HOY })
  const n = g(estrategias, 'negociar_plazo')
  assert.ok(n, 'hay un postergado y un cobro posterior: negociar el plazo es una opción real')
  esEstrategiaCompleta(n)
  assert.equal(n.palancas.negociar.fecha_nueva, '2026-07-26')
  assert.ok(n.plan.acciones.some((a) => a.tipo === 'negociar_plazo'), 'el plan lleva la decisión explícita')
  assert.equal(n.metricas.postergados, 0, 'negociar NO es postergar: el egreso se paga en la fecha acordada')
})

// ── SENSIBILIDAD DE COBROS (fuera del ranking) ─────────────────────────────────
test('sensibilidad de cobros: informa el ahorro de adelantar el cobro más grande y NO compite en el ranking', () => {
  const dias = conVacios(dia('2026-07-24', [{ tipo: 'egreso', monto: 3000000, proveedor: 'Gruas', vencida: true }]), 30)
  dias.push(dia('2026-07-31', [{ tipo: 'ingreso', monto: 5000000, cliente: 'ClienteGrande' }]))
  const d = disenarEstrategias({ dias, cajaInicial: 0, hoy: HOY })
  assert.ok(d.sensibilidad.cobros.aplica, 'hay un cobro futuro que adelantar')
  assert.equal(d.sensibilidad.cobros.cobro.cliente, 'ClienteGrande')
  assert.ok(d.sensibilidad.cobros.ahorro_costo_financiero > 0, 'adelantar el cobro ahorra costo financiero')
  assert.match(d.sensibilidad.cobros.recomendacion, /gestionar|adelantar/i)
  // NO aparece como estrategia ejecutable en el ranking.
  assert.ok(!d.estrategias.comparacion.ranking.some((r) => /cobro|cobranza/i.test(r.clave)))
})

test('sensibilidad de cobros: no aplica cuando no hay un cobro futuro que adelantar', () => {
  const { cobros } = { cobros: sensibilidadCobros({ dias: [dia('2026-07-24', [{ tipo: 'egreso', monto: 100000, proveedor: 'X' }])] }, { palancas: {} }, 0) }
  assert.equal(cobros.aplica, false)
  assert.match(cobros.motivo, /no hay/i)
})

// ── RETROCOMPAT: escenarios sin data para avanzadas siguen dando 3 posturas ──────
test('retrocompat: sin obras, sin tasa, sin división ni cobro posterior → sólo las 3 posturas base', () => {
  const dias = [dia('2026-07-24', [{ tipo: 'egreso', monto: 100000, proveedor: 'X' }])]
  const d = disenarEstrategias({ dias, cajaInicial: 5000000, hoy: HOY })
  assert.equal(d.estrategias.generadas.length, 3, 'no se fabrica ninguna postura avanzada')
  assert.ok('sensibilidad' in d, 'la clave de sensibilidad existe siempre')
  assert.equal(d.sensibilidad.cobros.aplica, false)
})
