import test from 'node:test'
import assert from 'node:assert/strict'
import { cierreDeObra, mesesEntre } from './cierre.ts'
import type { PagoConObra } from '../../esquema.ts'

// LO QUE ATRAPA: que el cierre de una obra terminada vuelva a decir «sin datos de cobro» sobre una
// obra enteramente cobrada. Pasaba porque leía `pago_programado`, una tabla que ya nadie alimenta:
// devolvía CEROS para todas y la pantalla los publicaba como si fueran un hecho.

const pago = (c: Partial<PagoConObra> = {}): PagoConObra => ({
  id: 'p', orden: 1, tipo: 'certificado', rotulo: 'Certificación 1/2', monto: 1_000_000,
  neto: null, iva: null, historico: false, moneda: 'ARS', obraId: 'pilon', obraNombre: 'Pilón',
  obraCerrada: true, fechaPrevista: '2026-08-22', fechaPago: null, facturaNumero: null,
  reciboNumero: null, devolucionEn: null, devueltoEn: null, estadoFijado: null, ...c,
})

test('una obra cobrada entera dice «pagada», no «sin datos de cobro»', () => {
  const c = cierreDeObra([
    pago({ id: 'a', monto: 5_818_735, fechaPago: '2026-08-22', facturaNumero: 'FA 01-000218' }),
  ], '2026-05-01', '2026-08-22')
  assert.equal(c.cobrado, 5_818_735)
  assert.equal(c.pendiente, 0)
  assert.equal(c.rotuloCobro, 'pagada')
  assert.equal(c.facturas, 1)
  assert.equal(c.meses, 3)
})

test('con saldo pendiente se dice el número, no «pagada»', () => {
  const c = cierreDeObra([
    pago({ id: 'a', monto: 6_866_157.2, fechaPago: '2026-07-29' }),
    pago({ id: 'b', monto: 7_228_782 }),
  ], null, null)
  assert.equal(c.pendiente, 7_228_782)
  assert.equal(c.rotuloCobro, 'con saldo')
  assert.equal(c.meses, null, 'sin fechas no se inventa una duración')
})

test('NULL NO ES CERO: un pago sin importe no suma a ningún lado', () => {
  const c = cierreDeObra([pago({ monto: null })], null, null)
  assert.equal(c.cobrado, 0)
  assert.equal(c.pendiente, 0)
  assert.equal(c.rotuloCobro, 'sin datos de cobro')
})

test('el fondo de reparo no es deuda del cliente: va por su cuenta', () => {
  const c = cierreDeObra([
    pago({ id: 'a', monto: 10_000_000, fechaPago: '2026-08-22' }),
    pago({ id: 'r', tipo: 'fondo_reparo', monto: 500_000 }),
  ], null, null)
  assert.equal(c.faltaReparo, 500_000)
  assert.equal(c.pendiente, 0, 'el reparo NO engrosa lo que el cliente debe')
  assert.equal(c.rotuloCobro, 'pagada')
})

test('mesesEntre no devuelve cero ni negativo: sin duración real es null', () => {
  assert.equal(mesesEntre('2026-08-01', '2026-08-22'), null)
  assert.equal(mesesEntre('2026-08-01', '2026-05-01'), null)
})
