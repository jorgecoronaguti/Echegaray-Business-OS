// LAS PALANCAS DEL CFO — cada una MODELA una decisión distinta, con default = comportamiento actual.
//
// Verifica el contrato F5: `construirPlan` explora el espacio de decisiones de un tesorero (orden/obra,
// división de pago, descuento de cheque, negociación de plazo) SIN romper el comportamiento por defecto.
// Todo con datos sintéticos — no toca el Sheet ni ninguna fuente real.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construirPlan } from './plan-tesoreria.mjs'
import { reordenarPorObra } from './plan-tesoreria-palancas.mjs'

const HOY = new Date(2026, 6, 24)
const dia = (fecha, movimientos) => ({ fecha, saldo_inicial: 0, movimientos })
const pagoFinanciado = (acc) => acc.find((a) => a.tipo === 'pagar' && a.dependencias.length > 0)

// ── PALANCA 1 · ORDEN DE PAGOS: proteger una obra ──────────────────────────────
test('reordenarPorObra: pone la obra elegida primero sin romper el orden dentro de cada grupo', () => {
  const items = [{ obra: 'A', n: 1 }, { obra: 'B', n: 2 }, { obra: 'A', n: 3 }, { obra: null, n: 4 }]
  assert.deepEqual(reordenarPorObra(items, 'B').map((x) => x.n), [2, 1, 3, 4])
  assert.deepEqual(reordenarPorObra(items, null).map((x) => x.n), [1, 2, 3, 4], 'sin obra: orden intacto')
})

test('priorizarObra: la obra protegida se paga con caja; la otra queda financiada', () => {
  const dias = [dia('2026-07-24', [
    { tipo: 'egreso', monto: 800000, proveedor: 'ProvA', obra: 'ObraA' },
    { tipo: 'egreso', monto: 800000, proveedor: 'ProvB', obra: 'ObraB' },
  ])]
  const base = construirPlan({ dias, cajaInicial: 1000000, hoy: HOY })
  assert.match(pagoFinanciado(base.acciones).descripcion, /ProvB/, 'por defecto se financia el segundo (ProvB)')

  const protegido = construirPlan({ dias, cajaInicial: 1000000, hoy: HOY, politica: { priorizarObra: 'ObraB' } })
  assert.match(pagoFinanciado(protegido.acciones).descripcion, /ProvA/, 'protegiendo ObraB, ahora se financia ProvA')
  // No inventa plata: el faltante financiado es el mismo, sólo cambió A QUIÉN se protege.
  assert.equal(base.resumen.linea_maxima_usada, protegido.resumen.linea_maxima_usada)
})

// ── PALANCA 2 · DIVISIÓN DE UN PAGO ────────────────────────────────────────────
test('dividirPagos: paga parcial lo que la caja cubre y posterga el resto (vs postergar el pago entero)', () => {
  const dias = [dia('2026-07-24', [{ tipo: 'egreso', monto: 800000, proveedor: 'ProvX' }])]
  const base = construirPlan({ dias, cajaInicial: 500000, hoy: HOY })
  assert.ok(base.acciones.some((a) => a.tipo === 'postergar' && a.impacto_pesos === 800000), 'default: posterga el pago entero')
  assert.ok(!base.acciones.some((a) => a.tipo === 'pagar'), 'default: no paga nada')
  assert.equal(base.resumen.saldo_proyectado_final, 500000)

  const dividido = construirPlan({ dias, cajaInicial: 500000, hoy: HOY, politica: { dividirPagos: true } })
  const parcial = dividido.acciones.find((a) => a.tipo === 'pagar')
  const resto = dividido.acciones.find((a) => a.tipo === 'postergar')
  assert.equal(parcial.impacto_pesos, 500000, 'paga lo disponible')
  assert.equal(resto.impacto_pesos, 300000, 'posterga el resto')
  assert.equal(dividido.resumen.saldo_proyectado_final, 0, 'la caja se usó para el pago parcial')
  assert.equal(dividido.resumen.linea_maxima_usada, 0, 'no usa la línea: es división, no financiamiento')
})

test('dividirPagos NO afecta a un crítico (ese ya combina caja+línea) ni cuando no hay caja disponible', () => {
  const dias = [dia('2026-07-24', [{ tipo: 'egreso', monto: 800000, proveedor: 'ProvX' }])]
  // Sin caja por encima del piso: no hay parcial que pagar → posterga entero, como el default.
  const sinCaja = construirPlan({ dias, cajaInicial: 500000, liquidezMinima: 500000, hoy: HOY, politica: { dividirPagos: true } })
  assert.ok(!sinCaja.acciones.some((a) => a.tipo === 'pagar'), 'sin caja disponible: no divide')
  assert.ok(sinCaja.acciones.some((a) => a.tipo === 'postergar' && a.impacto_pesos === 800000))
})

// ── PALANCA 3 · DESCUENTO DE CHEQUE ────────────────────────────────────────────
test('viaCobertura descuento_cheque: cubre el bache con un cheque (costo único) sin tocar la línea', () => {
  const dias = [dia('2026-07-24', [{ tipo: 'egreso', monto: 1000000, proveedor: 'Gruas', vencida: true }])]
  const paramsFin = { tasaDescuentoChequeTNA: 0.4 }
  const base = construirPlan({ dias, cajaInicial: 200000, hoy: HOY, paramsFin })
  assert.equal(base.resumen.linea_maxima_usada, 800000, 'default: el faltante gira la línea (descubierto)')

  const cheque = construirPlan({ dias, cajaInicial: 200000, hoy: HOY, paramsFin, politica: { viaCobertura: 'descuento_cheque' } })
  const fin = cheque.acciones.find((a) => a.tipo === 'financiar')
  assert.equal(fin.linea, 'descuento_cheque', 'financia descontando un cheque')
  assert.equal(cheque.resumen.linea_maxima_usada, 0, 'no usa la línea: libera el margen del descubierto')
  assert.ok(cheque.resumen.costo_financiero_total > 0, 'el descuento tiene un costo ÚNICO')
  assert.equal(cheque.resumen.saldo_proyectado_final, 0, '200k caja + 800k del cheque − 1.000k pagado')
  // El costo del cheque NO crece día a día: agregar un día vacío no lo aumenta (a diferencia del descubierto).
  const chequeDosDias = construirPlan({ dias: [...dias, dia('2026-07-25', [])], cajaInicial: 200000, hoy: HOY, paramsFin, politica: { viaCobertura: 'descuento_cheque' } })
  assert.equal(chequeDosDias.resumen.costo_financiero_total, cheque.resumen.costo_financiero_total, 'costo único, no diario')
})

test('viaCobertura descuento_cheque cae al descubierto si NO se conoce la tasa (no inventa el costo)', () => {
  const dias = [dia('2026-07-24', [{ tipo: 'egreso', monto: 1000000, proveedor: 'Gruas', vencida: true }])]
  const sinTasa = construirPlan({ dias, cajaInicial: 200000, hoy: HOY, politica: { viaCobertura: 'descuento_cheque' } })
  const fin = sinTasa.acciones.find((a) => a.tipo === 'financiar')
  assert.notEqual(fin.linea, 'descuento_cheque', 'sin tasa de descuento no se puede descontar: usa el descubierto')
  assert.equal(sinTasa.resumen.linea_maxima_usada, 800000)
})

// ── PALANCA 4 · NEGOCIACIÓN DE PLAZO ───────────────────────────────────────────
test('negociar: mueve el egreso a una fecha con cobro y emite la acción explícita negociar_plazo', () => {
  const dias = [
    dia('2026-07-24', [{ tipo: 'egreso', monto: 800000, proveedor: 'ProvX' }]),
    dia('2026-07-25', []),
    dia('2026-07-26', [{ tipo: 'ingreso', monto: 2000000, cliente: 'A' }]),
  ]
  const base = construirPlan({ dias, cajaInicial: 100000, hoy: HOY })
  assert.ok(base.acciones.some((a) => a.tipo === 'postergar'), 'default: el egreso del día 1 se posterga')
  assert.equal(base.resumen.por_tipo.negociar_plazo, 0)

  const neg = construirPlan({ dias, cajaInicial: 100000, hoy: HOY, politica: { negociar: { proveedor: 'ProvX', monto: 800000, dias: 2, fechaNueva: '2026-07-26' } } })
  const accNeg = neg.acciones.find((a) => a.tipo === 'negociar_plazo')
  assert.ok(accNeg, 'emite la decisión explícita de negociar el plazo')
  assert.equal(accNeg.fecha, '2026-07-24', 'la decisión se registra en la fecha original')
  assert.equal(accNeg.nueva_fecha, '2026-07-26')
  // El egreso, ya reubicado, se paga el 26 con la caja del cobro — no se postergó.
  assert.ok(neg.acciones.some((a) => a.tipo === 'pagar' && a.fecha === '2026-07-26' && /ProvX/.test(a.descripcion)))
  assert.ok(!neg.acciones.some((a) => a.tipo === 'postergar'), 'negociar no es postergar a ciegas')
  assert.equal(neg.resumen.saldo_proyectado_final, 1300000, '100k + 2.000k − 800k')
})

// ── RETROCOMPAT ────────────────────────────────────────────────────────────────
test('retrocompat: sin política, el plan es idéntico al de antes (palancas todas en su default)', () => {
  const dias = [dia('2026-07-24', [
    { tipo: 'ingreso', monto: 500000, cliente: 'A' },
    { tipo: 'egreso', monto: 300000, proveedor: 'X' },
  ])]
  const sinPol = construirPlan({ dias, cajaInicial: 0, hoy: HOY })
  const polVacia = construirPlan({ dias, cajaInicial: 0, hoy: HOY, politica: {} })
  assert.deepEqual(sinPol.resumen, polVacia.resumen, 'politica:{} no cambia nada')
  assert.equal(sinPol.resumen.por_tipo.negociar_plazo, 0, 'el contador nuevo arranca en 0')
  assert.equal(sinPol.acciones.every((a) => 'nueva_fecha' in a), true, 'el campo nuevo existe en toda acción')
})
