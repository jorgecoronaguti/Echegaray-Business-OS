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
  porBanco: 500000, enEfectivo: 200000, cobra: 700000, adelanto: 0, yaTransferido: 0,
  pagadoBanco: 0, pagadoEfectivo: 0, sueldo: null, reciboNeto: null, sello: null, manual: {},
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

test('el mensual no tiene horas en blanco ni en negro: se dice por qué y paga banco + efectivo', () => {
  const d = conceptosDisponibles(mensual, true)
  assert.match(d.blanco ?? '', /cobra por mes/)
  assert.equal(eleccionInicial(mensual, true).blanco, false)
  const r = armarRecibo(mensual, { ...eleccionInicial(mensual, true), blanco: true }, fmt, true)
  assert.equal(r.horas.length, 0)
  assert.equal(r.total, 700000)
})

// ═══ LO QUE ENCONTRÓ LA AUDITORÍA DEL 22/09/2026 ═══

test('sin modelo blanco + negro el adelanto NO se descuenta dos veces: el total es el cobra', () => {
  // Quincena cerrada: cobra 500.000, banco 200.000, adelanto 100.000 → enEfectivo = 200.000.
  // Antes el papel decía Efectivo 200.000 · ya pagado 100.000 · resta 200.000, y total 400.000.
  const cerrada = {
    sueldo: null, cobra: 500000, porBanco: 200000, adelanto: 100000, yaTransferido: 0, enEfectivo: 200000,
    pagadoBanco: 0, pagadoEfectivo: 0, pago: pagoDeLaLinea({ banco: null, negro: null }),
  } as unknown as LineaConOverrides
  const r = armarRecibo(cerrada, { blanco: false, negro: false, banco: true, efectivo: true, pagado: true }, fmt, false)
  assert.deepEqual(r.medios.map((m) => [m.rotulo, m.importe]), [
    ['Depósito en banco', 200000], ['ya pagado', 0], ['resta', 200000],
    ['Efectivo', 300000], ['ya pagado', 100000], ['resta', 200000],
  ])
  assert.equal(r.total, 500000, 'banco + efectivo = lo que cobra')
})

test('a un jornalero de una quincena cerrada NO se le dice «cobra por mes»', () => {
  const cerrada = { ...mensual, sueldo: null } as unknown as LineaConOverrides
  assert.match(conceptosDisponibles(cerrada, false).blanco ?? '', /no guarda el detalle/)
})

test('lo cobrado de más se escribe en el papel, no queda escondido en un «resta $ 0»', () => {
  const l = {
    ...jornalero, pago: pagoDeLaLinea({ banco: 0, negro: 41262, pagadoEfectivo: 100000 }),
  } as unknown as LineaConOverrides
  const r = armarRecibo(l, { blanco: false, negro: false, banco: false, efectivo: true, pagado: true }, fmt)
  assert.deepEqual(r.medios.map((m) => m.rotulo), ['Efectivo', 'ya pagado', 'cobró de más', 'resta'])
  assert.equal(r.medios.find((m) => m.rotulo === 'cobró de más')?.importe, 58738)
})

test('el blanco dice que es bruto, y lo pagado de más en efectivo se escribe debajo del banco que lo absorbe', () => {
  // Real, 22/09 (Agüero 16–30/09): efectivo 41.262 con 51.000 ya pagados → 9.738 de más, que baja el banco.
  const l = {
    ...jornalero, sueldo: { ...(jornalero.sueldo as object), negro: 41262 },
    pago: pagoDeLaLinea({ banco: 230240.12, negro: 41262, pagadoEfectivo: 51000 }),
  } as unknown as LineaConOverrides
  const r = armarRecibo(l, { blanco: true, negro: false, banco: true, efectivo: false, pagado: true }, fmt)
  assert.match(r.horas[0].detalle ?? '', /bruto$/)
  assert.deepEqual(r.medios.map((m) => [m.rotulo, m.importe]), [
    ['Depósito en banco', 230240.12], ['ya pagado', 0], ['menos lo pagado de más en efectivo', -9738], ['resta', 220502.12],
  ])
})
