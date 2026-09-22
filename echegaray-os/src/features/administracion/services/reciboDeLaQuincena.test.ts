import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarRecibo, conceptosDisponibles, eleccionInicial, ROTULO } from './reciboDeLaQuincena.ts'
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

test('el papel dice las horas TOTALES y los dos medios, sin abrir blanco y negro', () => {
  const r = armarRecibo(jornalero, eleccionInicial(jornalero), fmt)
  // 45 en blanco + 51 en negro = 96 h trabajadas. El reparto no se imprime: es una cuenta interna.
  assert.deepEqual(r.horas.map((h) => [h.rotulo, h.horas, h.importe]), [['Horas trabajadas', 96, null]])
  assert.deepEqual(r.medios.map((m) => [m.rotulo, m.importe]), [['Depósito en banco', 230000], ['Efectivo', 306000]])
  assert.equal(r.total, 536000)
})

test('lo que no se tilda no se imprime ni se suma', () => {
  const r = armarRecibo(jornalero, { horas: false, horasRecibo: false, horasFuera: false, banco: false, efectivo: true, pagado: false }, fmt)
  assert.deepEqual(r.horas.map((h) => h.rotulo), [])
  assert.deepEqual(r.medios.map((m) => m.rotulo), ['Efectivo'])
  assert.equal(r.total, 306000)
})

test('«lo ya pagado» agrega, debajo de cada medio, el adelanto y lo que resta, sin tocar el total', () => {
  const r = armarRecibo(jornalero, { horas: false, horasRecibo: false, horasFuera: false, banco: false, efectivo: true, pagado: true }, fmt)
  assert.deepEqual(r.medios.map((m) => [m.rotulo, m.importe, !!m.sub]), [['Efectivo', 306000, false], ['ya pagado', 100000, true], ['resta', 206000, true]])
  assert.equal(r.total, 306000)
})

test('un medio sin número no se imprime como $ 0: el total queda sin dato', () => {
  const sinNegro = { ...jornalero, pago: { ...jornalero.pago, negro: null } } as LineaConOverrides
  assert.equal(armarRecibo(sinNegro, eleccionInicial(sinNegro), fmt).total, null)
})

test('el mensual no tiene horas en blanco ni en negro: se dice por qué y paga banco + efectivo', () => {
  const d = conceptosDisponibles(mensual, true)
  assert.match(d.horas ?? '', /cobra por mes/)
  assert.equal(eleccionInicial(mensual, true).horas, false)
  const r = armarRecibo(mensual, { ...eleccionInicial(mensual, true), horas: true }, fmt, true)
  assert.equal(r.horas.length, 0)
  assert.equal(r.total, 700000)
})

// ═══ LO QUE ENCONTRÓ LA AUDITORÍA DEL 22/09/2026 ═══


test('a un jornalero de una quincena cerrada NO se le dice «cobra por mes»', () => {
  const cerrada = { ...mensual, sueldo: null, horas: null } as unknown as LineaConOverrides
  assert.match(conceptosDisponibles(cerrada, false).horas ?? '', /sin horas cargadas/)
})

test('lo cobrado de más se escribe en el papel, no queda escondido en un «resta $ 0»', () => {
  const l = {
    ...jornalero, pago: pagoDeLaLinea({ banco: 0, negro: 41262, pagadoEfectivo: 100000 }),
  } as unknown as LineaConOverrides
  const r = armarRecibo(l, { horas: false, horasRecibo: false, horasFuera: false, banco: false, efectivo: true, pagado: true }, fmt)
  assert.deepEqual(r.medios.map((m) => m.rotulo), ['Efectivo', 'ya pagado', 'cobró de más', 'resta'])
  assert.equal(r.medios.find((m) => m.rotulo === 'cobró de más')?.importe, 58738)
})

test('el blanco dice que es bruto, y lo pagado de más en efectivo se escribe debajo del banco que lo absorbe', () => {
  // Real, 22/09 (Agüero 16–30/09): efectivo 41.262 con 51.000 ya pagados → 9.738 de más, que baja el banco.
  const l = {
    ...jornalero, sueldo: { ...(jornalero.sueldo as object), negro: 41262 },
    pago: pagoDeLaLinea({ banco: 230240.12, negro: 41262, pagadoEfectivo: 51000 }),
  } as unknown as LineaConOverrides
  const r = armarRecibo(l, { horas: true, horasRecibo: false, horasFuera: false, banco: true, efectivo: false, pagado: true }, fmt)
  assert.deepEqual(r.medios.map((m) => [m.rotulo, m.importe]), [
    ['Depósito en banco', 230240.12], ['ya pagado', 0], ['menos lo pagado de más en efectivo', -9738], ['resta', 220502.12],
  ])
})



// ═══ LA RAMA SIN MODELO BLANCO + NEGRO (mensual sellado, Oficina, finales, quincena cerrada) ═══
//
// Dos vueltas de auditoría el 22/09/2026: primero el adelanto se descontaba dos veces; después lo YA
// TRANSFERIDO se contaba de los dos lados y el papel declaraba $ 50.000 menos de deuda. El papel imprime la
// misma cadena que el panel: cobra − adelanto − ya transferido = banco + efectivo.
const cerrada = (extra = {}) => ({
  sueldo: null, cobra: 500000, porBanco: 200000, adelanto: 100000, yaTransferido: 50000, enEfectivo: 150000,
  pagadoBanco: 0, pagadoEfectivo: 0, pago: pagoDeLaLinea({ banco: null, negro: null }), ...extra,
} as unknown as LineaConOverrides)

test('el papel imprime lo que se paga hoy: banco + efectivo, sin contar dos veces el adelanto ni lo transferido', () => {
  const r = armarRecibo(cerrada(), { horas: false, horasRecibo: false, horasFuera: false, banco: true, efectivo: true, pagado: false }, fmt, false)
  assert.deepEqual(r.medios.map((m) => [m.rotulo, m.importe]), [['Depósito en banco', 200000], ['Efectivo', 150000]])
  assert.equal(r.total, 350000, 'cobra 500.000 − adelanto 100.000 − transferido 50.000')
})

test('con «lo ya pagado» tildado, lo cobrado antes se dice UNA vez y arriba', () => {
  const r = armarRecibo(cerrada(), { horas: false, horasRecibo: false, horasFuera: false, banco: true, efectivo: true, pagado: true }, fmt, false)
  assert.deepEqual(r.medios.map((m) => [m.rotulo, m.importe]), [
    ['Cobra la quincena', 500000], ['menos el adelanto', -100000], ['menos lo ya transferido', -50000],
    ['Depósito en banco', 200000], ['Efectivo', 150000],
  ])
  assert.equal(r.total, 350000)
  const pagado = r.medios.filter((m) => m.rotulo === 'ya pagado')
  assert.equal(pagado.length, 0, 'sin un «ya pagado» por medio que vuelva a restar lo mismo')
})

test('sin adelantos ni transferencias, el papel no agrega renglones que no dicen nada', () => {
  const r = armarRecibo(cerrada({ adelanto: 0, yaTransferido: 0, enEfectivo: 300000 }),
    { horas: false, horasRecibo: false, horasFuera: false, banco: true, efectivo: true, pagado: true }, fmt, false)
  assert.deepEqual(r.medios.map((m) => m.rotulo), ['Depósito en banco', 'Efectivo'])
  assert.equal(r.total, 500000)
})

// ═══ LAS DOS OPCIONES DEL 22/09/2026 ═══
//
// «en recibo quiero dos opciones adicionales q sean hs trabajadas por recibo y hs trabajadas fuera de
// recibo». Son el reparto, dicho por lo que el papel del estudio cubre — y por eso no pueden salir solas ni
// llamarse blanco y negro: el control de emisión rebota esas dos palabras y el recibo no se podría guardar.

test('las dos opciones nuevas están APAGADAS por defecto: el papel sigue diciendo sólo el total', () => {
  const e = eleccionInicial(jornalero)
  assert.equal(e.horasRecibo, false)
  assert.equal(e.horasFuera, false)
  const r = armarRecibo(jornalero, e, fmt)
  assert.deepEqual(r.horas.map((h) => h.rotulo), ['Horas trabajadas'])
})

test('tildadas, el reparto va debajo del total y sangrado, y las partes suman el total', () => {
  const r = armarRecibo(jornalero, { ...eleccionInicial(jornalero), horasRecibo: true, horasFuera: true }, fmt)
  assert.deepEqual(r.horas.map((h) => [h.rotulo, h.horas, h.sub]), [
    ['Horas trabajadas', 96, undefined],
    ['Horas trabajadas por recibo', 45, true],
    ['Horas trabajadas fuera de recibo', 51, true],
  ])
  assert.equal(45 + 51, 96, 'las partes son las de la cifra de arriba, no otra cuenta')
})

test('ninguno de los dos rótulos nuevos dice «blanco» ni «negro»: si lo dijeran, el recibo no se podría emitir', () => {
  assert.equal(/blanc[oa]s?|negr[oa]s?/i.test(ROTULO.horasRecibo), false)
  assert.equal(/blanc[oa]s?|negr[oa]s?/i.test(ROTULO.horasFuera), false)
})

test('sin reparto cargado no se ofrece la opción, y se dice por qué — nunca «0 h fuera de recibo»', () => {
  const d = conceptosDisponibles(mensual, true)
  assert.equal(d.horasRecibo, 'cobra por mes: no se liquida por hora')
  const r = armarRecibo(mensual, { ...eleccionInicial(mensual, true), horasRecibo: true, horasFuera: true }, fmt, true)
  assert.deepEqual(r.horas, [], 'tildada a la fuerza, tampoco imprime un cero inventado')
})
