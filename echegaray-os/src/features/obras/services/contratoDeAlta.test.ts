// EL ALTA SIEMBRA EL CONTRATO DEL PAPEL QUE HAY Y NUNCA FABRICA UN PRECIO.
//
// Defecto real (29/09/2026): OB-0072 y OB-0073 sin fila en `obra_contrato` anularon el contratado de
// Messina. Lo que se prueba es lo contrario de fabricar: sin origen utilizable, NO hay fila.
// Si se revierte el arreglo (p. ej. asentar 0 o suponer el IVA de una OC), estos tests se ponen rojos.

import test from 'node:test'
import assert from 'node:assert/strict'
import { decidirContratoDeAlta, type OrdenDeCompra, type PresupuestoAprobado } from './contratoDeAlta.ts'

const pres = (o: Partial<PresupuestoAprobado> = {}): PresupuestoAprobado =>
  ({ id: '3484a139', version: 1, monto: 1209118.58, moneda_original: null, ...o })
const oc = (o: Partial<OrdenDeCompra> = {}): OrdenDeCompra =>
  ({ id: 'x1', numero: '00002-00002345', importe: 1209118.58, moneda: 'ARS', importe_es_neto: true,
     drive_file_id: 'DRV', nombre_archivo: 'OC.pdf', ...o })

test('presupuesto aprobado: crea con su monto neto, sin desglose inventado', () => {
  const d = decidirContratoDeAlta([pres()], [])
  assert.equal(d.tipo, 'crear')
  if (d.tipo !== 'crear') return
  assert.equal(d.fila.mano_obra, 1209118.58)
  assert.equal(d.fila.materiales, null)
  assert.equal(d.fila.fuente_tipo, 'presupuesto')
  assert.match(d.fila.nota, /SIN desglosar/)
})

test('el presupuesto manda sobre la OC', () => {
  const d = decidirContratoDeAlta([pres({ monto: 100 })], [oc({ importe: 999 })])
  assert.equal(d.tipo === 'crear' && d.fila.mano_obra, 100)
})

test('sin presupuesto: la OC en pesos con importe NETO alcanza y lleva su papel', () => {
  const d = decidirContratoDeAlta([], [oc()])
  assert.equal(d.tipo, 'crear')
  if (d.tipo !== 'crear') return
  assert.equal(d.fila.fuente_tipo, 'oc')
  assert.equal(d.fila.fuente_drive_id, 'DRV')
})

test('OC con IVA: no se supone la alícuota, no se crea', () => {
  for (const neto of [false, null]) {
    const d = decidirContratoDeAlta([], [oc({ importe: 1463033.48, importe_es_neto: neto })])
    assert.equal(d.tipo, 'sin_precio')
  }
})

test('sin origen: no crea fila (jamás con 0) y dice el motivo', () => {
  const d = decidirContratoDeAlta([], [])
  assert.equal(d.tipo, 'sin_precio')
  if (d.tipo === 'sin_precio') assert.match(d.motivo, /Sin presupuesto aprobado ni orden de compra/)
})

test('monto nulo, cero o negativo no es un precio', () => {
  for (const monto of [null, 0, -5, Number.NaN]) {
    assert.equal(decidirContratoDeAlta([pres({ monto })], []).tipo, 'sin_precio')
  }
  assert.equal(decidirContratoDeAlta([], [oc({ importe: 0 })]).tipo, 'sin_precio')
})

test('moneda que no es pesos: no se convierte', () => {
  assert.equal(decidirContratoDeAlta([pres({ moneda_original: 'USD' })], []).tipo, 'sin_precio')
  assert.equal(decidirContratoDeAlta([], [oc({ moneda: 'USD' })]).tipo, 'sin_precio')
})

test('dos presupuestos aprobados con montos distintos: no se elige uno, ni se salta a la OC', () => {
  const d = decidirContratoDeAlta([pres({ id: 'a', monto: 10 }), pres({ id: 'b', monto: 20 })], [oc()])
  assert.equal(d.tipo, 'sin_precio')
})

test('dos aprobados con el mismo monto son el mismo precio', () => {
  const d = decidirContratoDeAlta([pres({ id: 'a' }), pres({ id: 'b' })], [])
  assert.equal(d.tipo, 'crear')
})

test('varias OC sin presupuesto: no se suman por su cuenta', () => {
  assert.equal(decidirContratoDeAlta([], [oc({ id: 'a' }), oc({ id: 'b' })]).tipo, 'sin_precio')
})
