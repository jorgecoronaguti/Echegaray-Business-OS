import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  diasEntre, sumarDias, mediana, mad,
  esCobroCerrado, delayDeCobro, perfilCliente, perfilesDeCobro,
  proyectarCobro, ajustarMovimientosCobranza,
  MIN_COBROS_PARCIAL,
} from './aprendizaje-cobranzas.mjs'

const d = (s) => { const [y, m, day] = s.split('-').map(Number); return new Date(y, m - 1, day) }
// Un cobro cerrado con atraso `at` días respecto de la fecha esperada.
const cobro = (cliente, esperada, at) => ({ cliente, estado: 'Cobrado', fecha_esperada: esperada, fecha_cobro: sumarDias(esperada, at) })

// ─── helpers de fechas y estadística ─────────────────────────────────────────

test('diasEntre cuenta días calendario (Q − P), con signo', () => {
  assert.equal(diasEntre('2026-07-01', '2026-07-11'), 10)
  assert.equal(diasEntre('2026-07-11', '2026-07-01'), -10)
  assert.equal(diasEntre(null, '2026-07-01'), null)
})

test('mediana y MAD son robustas a un valor atípico', () => {
  assert.equal(mediana([10, 12, 11, 13, 200]), 12)
  assert.equal(mad([10, 12, 11, 13, 12]), 1) // desviaciones |x-12| = [2,0,1,1,0] → mediana 1
})

// ─── esCobroCerrado / delayDeCobro: sólo lo COBRADO con ambas fechas ──────────

test('sólo un cobrado con fecha esperada Y fecha real entra a la historia', () => {
  assert.equal(esCobroCerrado(cobro('ACME', '2026-06-01', 5)), true)
  assert.equal(esCobroCerrado({ cliente: 'ACME', estado: 'Pendiente', fecha_esperada: '2026-06-01', fecha_cobro: '2026-06-06' }), false)
  assert.equal(esCobroCerrado({ cliente: 'ACME', estado: 'Cobrado', fecha_esperada: '2026-06-01' }), false) // sin Q
  assert.equal(esCobroCerrado({ cliente: 'ACME', estado: 'Cobrado', fecha_cobro: '2026-06-06' }), false)    // sin P
})

test('delayDeCobro = Q − P para el cobrado; null para lo que no es historia', () => {
  assert.equal(delayDeCobro(cobro('ACME', '2026-06-01', 7)), 7)
  assert.equal(delayDeCobro(cobro('ACME', '2026-06-01', -3)), -3) // pagó antes
  assert.equal(delayDeCobro({ cliente: 'X', estado: 'Proyectado', fecha_esperada: '2026-06-01', fecha_cobro: '2026-06-30' }), null)
})

// ─── perfilCliente: atraso, dispersión, tasa de cobro, evidencia ─────────────

test('perfil de un cliente con historia fuerte: mediana del atraso y tasa de cobro', () => {
  const regs = [
    cobro('ACME', '2026-01-01', 10), cobro('ACME', '2026-02-01', 12), cobro('ACME', '2026-03-01', 11),
    cobro('ACME', '2026-04-01', 13), cobro('ACME', '2026-05-01', 12),
    { cliente: 'ACME', estado: 'Pendiente', fecha_esperada: '2026-06-01', fecha_cobro: null }, // no cobrado aún
  ]
  const p = perfilCliente('ACME', regs)
  assert.equal(p.n_total, 6)
  assert.equal(p.n_cobros, 5)
  assert.equal(p.atraso_mediano, 12)
  assert.equal(p.evidencia, 'inferido_fuerte')
  assert.equal(p.tasa_cobro, 0.833) // 5 de 6
  assert.ok(p.confianza >= 0.7)
})

test('cliente con pocos cobros → inferido_parcial, confianza intermedia', () => {
  const p = perfilCliente('POCO', [cobro('POCO', '2026-01-01', 20), cobro('POCO', '2026-02-01', 40)])
  assert.equal(p.n_cobros, MIN_COBROS_PARCIAL)
  assert.equal(p.evidencia, 'inferido_parcial')
  assert.equal(p.atraso_mediano, 30)
})

test('cliente con un solo cobro → sin_historia_suficiente (no se concluye)', () => {
  const p = perfilCliente('NUEVO', [cobro('NUEVO', '2026-01-01', 15)])
  assert.equal(p.evidencia, 'sin_historia_suficiente')
  assert.ok(p.confianza <= 0.2)
})

// ─── perfilesDeCobro: agrupa y arma el global ────────────────────────────────

test('perfilesDeCobro agrupa por cliente y calcula el global', () => {
  const historia = [
    cobro('ACME', '2026-01-01', 10), cobro('ACME', '2026-02-01', 10),
    cobro('OTRO', '2026-01-01', 30),
  ]
  const p = perfilesDeCobro(historia)
  assert.equal(p.n_clientes, 2)
  assert.equal(p.por_cliente.ACME.atraso_mediano, 10)
  assert.equal(p.global.n_cobros, 3)
})

// ─── proyectarCobro: SIEMPRE inferida, nunca pisa la nominal ─────────────────

test('proyecta la fecha ajustada con el atraso del cliente y la marca INFERIDO', () => {
  const perfiles = perfilesDeCobro([
    cobro('ACME', '2026-01-01', 12), cobro('ACME', '2026-02-01', 12), cobro('ACME', '2026-03-01', 12),
    cobro('ACME', '2026-04-01', 12), cobro('ACME', '2026-05-01', 12),
  ])
  const pr = proyectarCobro({ cliente: 'ACME', fecha_esperada: '2026-08-01' }, perfiles)
  assert.equal(pr.tipo, 'INFERIDO')
  assert.equal(pr.fecha_esperada, '2026-08-01') // la nominal NO se toca
  assert.equal(pr.fecha_ajustada, '2026-08-13') // +12
  assert.equal(pr.dias_ajuste, 12)
  assert.equal(pr.base, 'cliente')
  assert.equal(pr.evidencia, 'inferido_fuerte')
})

test('cliente SIN historia suficiente → cae al atraso GLOBAL y lo declara con baja confianza', () => {
  const perfiles = perfilesDeCobro([
    cobro('ACME', '2026-01-01', 20), cobro('ACME', '2026-02-01', 20), cobro('ACME', '2026-03-01', 20),
    cobro('ACME', '2026-04-01', 20), cobro('ACME', '2026-05-01', 20),
  ])
  const pr = proyectarCobro({ cliente: 'DESCONOCIDO', fecha_esperada: '2026-08-01' }, perfiles)
  assert.equal(pr.base, 'global')
  assert.equal(pr.evidencia, 'inferido_global')
  assert.equal(pr.fecha_ajustada, '2026-08-21') // +20 global
  assert.ok(pr.confianza < 0.5)
  assert.match(pr.nota, /global/i)
})

test('sin ninguna historia: ajuste 0 = fecha nominal, evidencia sin_base, y se DICE', () => {
  const pr = proyectarCobro({ cliente: 'X', fecha_esperada: '2026-08-01' }, perfilesDeCobro([]))
  assert.equal(pr.base, 'ninguna')
  assert.equal(pr.evidencia, 'sin_base')
  assert.equal(pr.fecha_ajustada, '2026-08-01') // no inventa un atraso
  assert.equal(pr.dias_ajuste, 0)
  assert.match(pr.nota, /no hay historia/i)
})

test('sin fecha esperada no se inventa un día: fecha_ajustada null, declarado', () => {
  const pr = proyectarCobro({ cliente: 'ACME' }, perfilesDeCobro([cobro('ACME', '2026-01-01', 10)]))
  assert.equal(pr.fecha_ajustada, null)
  assert.equal(pr.dias_ajuste, null)
  assert.equal(pr.tipo, 'INFERIDO')
})

// ─── ajustarMovimientosCobranza: puro, aditivo, no muta, no rompe el plan ─────

test('reproyecta los cobros y conserva la fecha nominal, sin mutar el original', () => {
  const perfiles = perfilesDeCobro([
    cobro('ACME', '2026-01-01', 5), cobro('ACME', '2026-02-01', 5), cobro('ACME', '2026-03-01', 5),
    cobro('ACME', '2026-04-01', 5), cobro('ACME', '2026-05-01', 5),
  ])
  const movs = [{ tipo: 'ingreso', categoria: 'cobranza', cliente: 'ACME', monto: 100, fecha: d('2026-08-01'), fecha_esperada: d('2026-08-01') }]
  const out = ajustarMovimientosCobranza(movs, perfiles)
  assert.equal(out[0].fecha.getTime(), d('2026-08-06').getTime()) // +5
  assert.equal(out[0].fecha_nominal.getTime(), d('2026-08-01').getTime())
  assert.equal(out[0]._proyeccion_cobro.tipo, 'INFERIDO')
  // el original quedó intacto (no se mutó)
  assert.equal(movs[0].fecha.getTime(), d('2026-08-01').getTime())
  assert.equal(movs[0].fecha_nominal, undefined)
})

test('los egresos y los ingresos que no son cobranza pasan intactos', () => {
  const perfiles = perfilesDeCobro([cobro('ACME', '2026-01-01', 5), cobro('ACME', '2026-02-01', 5)])
  const egreso = { tipo: 'egreso', categoria: 'cheque', monto: 50, fecha: d('2026-08-01') }
  const ingresoOtro = { tipo: 'ingreso', categoria: 'aporte', monto: 10, fecha: d('2026-08-01') }
  const out = ajustarMovimientosCobranza([egreso, ingresoOtro], perfiles)
  assert.equal(out[0], egreso) // misma referencia: intacto
  assert.equal(out[1], ingresoOtro)
})

test('sin perfiles utilizables, la cobranza mantiene su fecha (ajuste 0): no rompe el calendario', () => {
  const movs = [{ tipo: 'ingreso', categoria: 'cobranza', cliente: 'ACME', monto: 100, fecha: d('2026-08-01') }]
  const out = ajustarMovimientosCobranza(movs, perfilesDeCobro([]))
  assert.equal(out[0].fecha.getTime(), d('2026-08-01').getTime()) // igual que la nominal
  assert.equal(out[0]._proyeccion_cobro.evidencia, 'sin_base')
})
