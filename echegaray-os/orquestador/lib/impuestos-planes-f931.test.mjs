import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conPlanesF931, cuotasDeCompras, estimacionesF931, vencimientoF931Supuesto, conVencimientoF931 } from './impuestos-planes-f931.mjs'
import { obligacionesF931 } from './impuestos-registro.mjs'
import { pagosDelBanco, pagosDeCompras, conEstadoDePago } from './impuestos-registro-pagos.mjs'

// Las filas de Compras y los débitos del extracto como estaban el 17/09/2026 (compra_sheet 697–699, 443–444).
const plan = (x) => ({ proveedor: 'ARCA', estado: 'ELIMINADO', estado_pago: 'ELIMINADO', total: 0, monto_pagado: 0, ...x })
const W = [
  plan({ fila: 697, concepto: 'Plan F931 W303094', detalle_obra: 'JUNIO Financiación - Cuota 1 1° Venc', fecha: '2026-08-16', monto_pagado: 2494875.65 }),
  plan({ fila: 698, concepto: 'Plan F931 W303094', detalle_obra: 'JUNIO Financiación - Cuota 2 1° Venc', fecha: '2026-09-16' }),
  plan({ fila: 699, concepto: 'Plan F931 W303094', detalle_obra: 'JUNIO Financiación - Cuota 3 1° Venc', fecha: '2026-10-16' }),
]
const deb = (id, fecha, importe) => ({ id, fecha, importe: -importe, concepto: 'Debito automatico - Afip -30716304643' })
const vep = (id, fecha, importe) => ({ id, fecha, importe: -importe, concepto: 'Pago de servicios - Imp.afip: 3071630464311793242' })
const JUNIO = [['2026-06', '351', 'x', 11950853.86, 22, 18280840]]

function armar({ compras = W, banco = [], pagosCompletos = true } = {}) {
  const obl = obligacionesF931(JUNIO)
  const f931 = new Map(obl.map((o) => [o.periodo, o.determinado]))
  const deC = pagosDeCompras(compras, { f931 })
  const pagos = [...pagosDelBanco(banco, { f931, cuotasPlan: deC.cuotasPlan }), ...deC.pagos]
    .map((p) => (p.referencia === 'banco:1' ? { ...p, impuesto: 'cargas_sociales', periodo: '2026-06', concepto: 'ddjj', imputacion: 'documento' } : p))
  const r = conPlanesF931({ compras, pagos, obligaciones: obl, pagosCompletos })
  return { ...r, obligaciones: conEstadoDePago(r.obligaciones, r.pagos) }
}
const BANCO = [vep(1, '2026-07-20', 4859763.28), deb(2, '2026-08-18', 2494875.65), deb(3, '2026-09-16', 2494875.65)]

test('el F931 de un período con plan no queda pendiente por el saldo que ya está en cuotas', () => {
  const { obligaciones } = armar({ banco: BANCO })
  const junio = obligaciones.find((o) => o.concepto === 'ddjj')
  assert.equal(junio.a_pagar, 4859763.28)
  assert.equal(junio.estado, 'pagado')
  assert.equal(junio.detalle.financiado_en_plan.importe, 7091090.58)
  assert.equal(junio.determinado, 11950853.86, 'lo devengado no se toca: sólo lo que se paga por VEP')
})

test('cada cuota es su propia obligación n/N; la pagada por el banco queda pagada y la futura sin importe queda estimada, no en 0', () => {
  const { obligaciones, pagos } = armar({ banco: BANCO })
  const cuotas = obligaciones.filter((o) => o.detalle.plan === 'Plan F931 W303094')
  assert.deepEqual(cuotas.map((c) => [c.concepto, c.estado, c.a_pagar, c.vencimiento]), [
    ['Plan F931 W303094 · cuota 1/3', 'pagado', 2494875.65, '2026-08-16'],
    ['Plan F931 W303094 · cuota 2/3', 'pagado', 2494875.65, '2026-09-16'],
    ['Plan F931 W303094 · cuota 3/3', 'estimado', 2494875.65, '2026-10-16'],
  ])
  assert.equal(cuotas[2].detalle.importe_fuente, 'igual a otra cuota del plan (supuesto)')
  assert.ok(pagos.filter((p) => p.tipo === 'debito_automatico').every((p) => p.periodo === '2026-06'))
})

test('dos planes debitados el mismo día: la cuota sin importe no se lleva el débito del otro plan', () => {
  const dic = [
    plan({ fila: 429, concepto: 'cuota 4', detalle_obra: 'Deuda Previcional - 931 Dic 25', fecha: '2026-05-16', total: 1034931.82 }),
    plan({ fila: 443, concepto: 'cuota 5', detalle_obra: 'Deuda Previcional - 931 Dic 25', fecha: '2026-06-16' }),
    plan({ fila: 444, detalle_obra: 'Deuda Previcional - 931 Enero 26', fecha: '2026-06-16' }),
    plan({ fila: 430, detalle_obra: 'Deuda Previcional - 931 Enero 26', fecha: '2026-05-16', total: 473767.08 }),
  ]
  // El de enero primero en el extracto: atar por fecha sola se lo daría a la cuota 5 de dic-25.
  const { pagos, obligaciones } = armar({ compras: dic, banco: [deb(7, '2026-06-16', 473767.08), deb(8, '2026-06-16', 1034931.85)] })
  assert.equal(pagos.find((p) => p.referencia === 'banco:7').concepto, 'Deuda previsional ene-26 · cuota 2/2')
  assert.equal(pagos.find((p) => p.referencia === 'banco:8').concepto, 'Deuda previsional dic-25 · cuota 2/2')
  assert.equal(obligaciones.find((o) => o.concepto === 'Deuda previsional dic-25 · cuota 2/2').a_pagar, 1034931.85)
})

test('sin el extracto no se recorta el período: un saldo inflado por pagos faltantes escondería deuda', () => {
  const { obligaciones } = armar({ banco: [], pagosCompletos: false })
  assert.equal(obligaciones.find((o) => o.concepto === 'ddjj').a_pagar, 11950853.86)
})

test('las cuotas salen numeradas por fecha aunque Compras las traiga desordenadas', () => {
  assert.deepEqual(cuotasDeCompras([W[2], W[0], W[1]]).map((c) => [c.fila, c.n, c.de]), [[697, 1, 3], [698, 2, 3], [699, 3, 3]])
})

test('el F931 estimado sólo cubre meses sin DDJJ y ya devengados; sin fila, no hay obligación (nunca 0)', () => {
  const filas = [['Concepto', 'jul-26', 'ago-26', 'sep-26', 'oct-26'], ['⇒ Subtotal F931', '', '', 8166095, 9594466]]
  const e = estimacionesF931(filas, { declarados: ['2026-07', '2026-08'], hasta: '2026-09' })
  assert.deepEqual(e.map((o) => [o.periodo, o.a_pagar, o.estado, o.fuente, o.vencimiento]), [['2026-09', 8166095, 'estimado', 'calculo', '2026-10-10']])
  assert.deepEqual(estimacionesF931([['Concepto', 'sep-26']], { declarados: [], hasta: '2026-09' }), [])
})

test('vencimiento supuesto del F931: día 10 del mes siguiente, diciembre cruza de año, y queda marcado supuesto', () => {
  assert.equal(vencimientoF931Supuesto('2026-12'), '2027-01-10')
  const [o] = conVencimientoF931(obligacionesF931(JUNIO))
  assert.deepEqual([o.vencimiento, o.vencimiento_confianza], ['2026-07-10', 'supuesto'])
})
