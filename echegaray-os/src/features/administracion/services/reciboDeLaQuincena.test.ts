import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarRecibo, conceptosDisponibles, eleccionInicial } from './reciboDeLaQuincena.ts'
import { pagoDeLaLinea } from './pagoDeLaQuincena.ts'
import type { LineaConOverrides } from './liquidacionOverrides.ts'

const fmt = (n: number) => `$${n}`

// Un jornalero: 45 h en blanco (bruto 300.000, neto 230.000 por banco) y 51 h en negro × 6.000 = 306.000.
const jornalero = {
  porBanco: 230000, enEfectivo: 306000, pagadoBanco: 0, pagadoEfectivo: 100000,
  sueldo: { horasBlanco: 45, valorHoraCategoria: 6666.67, bruto: 300000, horasNegro: 51, valorHoraNegro: 6000, negro: 306000 },
  pago: pagoDeLaLinea({ banco: 230000, negro: 306000, pagadoEfectivo: 100000 }),
} as unknown as LineaConOverrides

const mensual = {
  porBanco: 500000, enEfectivo: 200000, pagadoBanco: 0, pagadoEfectivo: 0, sueldo: null,
  pago: pagoDeLaLinea({ banco: 500000, negro: 200000 }),
} as unknown as LineaConOverrides

test('por defecto el recibo del jornalero lleva las horas de los dos lados y los dos medios', () => {
  const r = armarRecibo(jornalero, eleccionInicial(jornalero), fmt)
  assert.deepEqual(r.horas.map((h) => [h.rotulo, h.horas, h.importe]), [['Horas en blanco', 45, 300000], ['Horas en negro', 51, 306000]])
  assert.deepEqual(r.medios.map((m) => [m.rotulo, m.importe]), [['Depósito en banco', 230000], ['Efectivo', 306000]])
  assert.equal(r.total, 536000)
})

test('lo que no se tilda no se imprime ni se suma', () => {
  const r = armarRecibo(jornalero, { blanco: false, negro: true, banco: false, efectivo: true, pagado: false }, fmt)
  assert.deepEqual(r.horas.map((h) => h.rotulo), ['Horas en negro'])
  assert.deepEqual(r.medios.map((m) => m.rotulo), ['Efectivo'])
  assert.equal(r.total, 306000)
})

test('«lo ya pagado» agrega, debajo de cada medio, el adelanto y lo que resta, sin tocar el total', () => {
  const r = armarRecibo(jornalero, { blanco: false, negro: false, banco: false, efectivo: true, pagado: true }, fmt)
  assert.deepEqual(r.medios.map((m) => [m.rotulo, m.importe, !!m.sub]), [['Efectivo', 306000, false], ['ya pagado', 100000, true], ['resta', 206000, true]])
  assert.equal(r.total, 306000)
})

test('un medio sin número no se imprime como $ 0: el total queda sin dato', () => {
  const sinNegro = { ...jornalero, pago: { ...jornalero.pago, negro: null } } as LineaConOverrides
  assert.equal(armarRecibo(sinNegro, eleccionInicial(sinNegro), fmt).total, null)
})

test('el mensual no tiene horas en blanco ni en negro: se dice por qué y paga banco + efectivo de la línea', () => {
  const d = conceptosDisponibles(mensual)
  assert.match(d.blanco ?? '', /cobra por mes/)
  assert.equal(eleccionInicial(mensual).blanco, false)
  const r = armarRecibo(mensual, { ...eleccionInicial(mensual), blanco: true }, fmt)
  assert.equal(r.horas.length, 0)
  assert.equal(r.total, 700000)
})
