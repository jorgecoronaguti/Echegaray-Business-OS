// LOS CASOS SON LOS DEL ARCHIVO VIVO DEL 04/09/2026, no inventados: si el control deja de verlos,
// vuelve el problema que el dueño reportó.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { huecosDeCruce, comprobanteIdentifica } from './cheques-huecos.mjs'

test('"VARIAS" no es un número de comprobante, y "VARIAS · recibo 0010-00000012" tampoco', () => {
  assert.equal(comprobanteIdentifica('0006-00003453'), true)
  assert.equal(comprobanteIdentifica('VARIAS'), false)
  assert.equal(comprobanteIdentifica('VARIAS · recibo 0010-00000012'), false)
  assert.equal(comprobanteIdentifica(''), false)
  assert.equal(comprobanteIdentifica('—'), false)
})

test('HORMISERV: cheque debitado sin número + factura pendiente sin número = PAGADO SIN BAJA', () => {
  const r = huecosDeCruce(
    [{ fila: 133, proveedor: 'Hormiserv', monto: 2953997, comprobante: '', debitado: 'SI', estadoOs: '' }],
    [{ fila: 820, proveedor: 'Hormiserv', monto: 2355725, comprobante: '', saldoPendiente: 2355725 }])
  assert.equal(r.pagadoSinBaja.length, 1)
  assert.equal(r.pagadoSinBaja[0].proveedor, 'HORMISERV')
  assert.equal(r.pagadoSinBaja[0].pendienteUsd, 2355725)
})

// EL CONTROL TIENE QUE PODER DAR VERDE. Si gritara también acá, sería una constante disfrazada de
// control: DUPEC tiene cheque Y pendiente, pero los dos con número, y son comprobantes DISTINTOS.
test('DUPEC: cheque y factura pendiente, ambos CON número distinto, NO es un hueco', () => {
  const r = huecosDeCruce(
    [{ fila: 132, proveedor: 'DUPEC', monto: 469565, comprobante: '0009-00003204', debitado: 'SI', estadoOs: '✓ su factura está en Compras' }],
    [{ fila: 912, proveedor: 'DUPEC', monto: 292800, comprobante: '0011-00002040', saldoPendiente: 292800 }])
  assert.deepEqual(r.pagadoSinBaja, [])
  assert.deepEqual(r.mudos, [])
})

test('un cheque cuyo proveedor no tiene NINGUNA fila en Compras se reporta con su monto', () => {
  const r = huecosDeCruce(
    [{ fila: 34, proveedor: 'GSI SRL', monto: 500000, comprobante: '0001-000036', debitado: 'SI', estadoOs: '▲ FALTA cargar' },
     { fila: 35, proveedor: 'GSI SRL', monto: 500000, comprobante: '0001-000036', debitado: 'SI', estadoOs: '▲ FALTA cargar' }],
    [{ fila: 10, proveedor: 'OTRO', monto: 100, comprobante: '1-1', saldoPendiente: 0 }])
  assert.equal(r.sinFactura.length, 1)
  assert.equal(r.sinFactura[0].proveedor, 'GSI SRL')
  assert.equal(r.sinFactura[0].monto, 1000000)
})

test('el cheque sin NI ✓ NI ▲ se reporta como MUDO — un renglón vacío no se lee como problema', () => {
  const r = huecosDeCruce(
    [{ fila: 135, proveedor: 'Robles Pintureria', monto: 483152, comprobante: '', debitado: 'NO', estadoOs: '' }],
    [{ fila: 887, proveedor: 'Robles Pintureria', monto: 112349, comprobante: '0006-00008111', saldoPendiente: 112349 }])
  assert.equal(r.mudos.length, 1)
  assert.equal(r.mudos[0].fila, 135)
  assert.equal(r.totales.montoMudo, 483152)
})

test('el nombre se compara normalizado: "S.A." y "SA" son el mismo proveedor', () => {
  const r = huecosDeCruce(
    [{ fila: 1, proveedor: 'Mariana S.A.', monto: 201075, comprobante: '0008-00000143', debitado: 'SI', estadoOs: '✓' }],
    [{ fila: 2, proveedor: 'MARIANA SA', monto: 763365, comprobante: '0015-00000147', saldoPendiente: 763365 }])
  assert.deepEqual(r.sinFactura, [], 'el proveedor SÍ está en Compras, con otra escritura')
})
