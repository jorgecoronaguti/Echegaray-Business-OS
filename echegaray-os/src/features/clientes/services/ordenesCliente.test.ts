import test from 'node:test'
import assert from 'node:assert/strict'
import { diaMes, importeCorto, numeroCorto, rotuloOrden } from './ordenesCliente.ts'

// LOS MISMOS NÚMEROS QUE `orquestador/lib/ordenes-cliente.test.mjs`, y a propósito: la regla del
// número canónico vive allá (se aplica al escribir) y acá se repite en TypeScript porque `src/` no
// importa del orquestador. Clavar los mismos casos es lo que hace que las dos no se separen en
// silencio — si una cambia sola, uno de los dos archivos se pone rojo.


test('el número que se dibuja es el corto, y el mismo para las tres formas de escribirlo', () => {
  assert.equal(numeroCorto('00002-00002162'), '2162')
  assert.equal(numeroCorto('02-00002162'), '2162')
  assert.equal(numeroCorto('0000000004865'), '4865')
  assert.equal(numeroCorto(null), null)
})

test('el rótulo identifica la orden: número y día', () => {
  assert.equal(rotuloOrden({ tipo: 'orden_compra', numero: '00002-00002162', fecha: '2026-08-05' }), 'OC 2162 · 05/08')
  assert.equal(rotuloOrden({ tipo: 'orden_pago', numero: '0000000005156', fecha: '2026-09-08' }), 'OP 5156 · 08/09')
  // Sin fecha NO se rellena con un guión que parezca dato, y sin número se dice «s/n».
  assert.equal(rotuloOrden({ tipo: 'orden_compra', numero: '00002-00002162', fecha: null }), 'OC 2162')
  assert.equal(rotuloOrden({ tipo: 'orden_compra', numero: null, fecha: '2026-08-05' }), 'OC s/n · 05/08')
  assert.equal(diaMes('2026-07-15'), '15/07')
  assert.equal(diaMes(null), null)
})

test('el rótulo lleva el IMPORTE, y sólo para quien ve precios', () => {
  // Pedido del dueño (10/09/2026): «OC 2173 · 11/08 · $…». El importe de una OC es el precio de
  // venta de la obra: con `veEconomia` en false el rótulo es el mismo sin la plata.
  const oc = { tipo: 'orden_compra', numero: '00002-00002173', fecha: '2026-08-11', importe: 78650000, moneda: 'ARS' }
  assert.equal(rotuloOrden(oc, { veEconomia: true }), 'OC 2173 · 11/08 · $78.650.000')
  assert.equal(rotuloOrden(oc, { veEconomia: false }), 'OC 2173 · 11/08')
  // Por defecto NO se publica el precio: un olvido tiene que dejar la pantalla pobre, no abierta.
  assert.equal(rotuloOrden(oc), 'OC 2173 · 11/08')
  // Sin importe no se inventa un cero: una OC por $ 0 sería una afirmación falsa sobre un contrato.
  assert.equal(rotuloOrden({ ...oc, importe: null, moneda: null }, { veEconomia: true }), 'OC 2173 · 11/08')
  assert.equal(importeCorto(6060479.39, 'ARS'), '$6.060.479')
  assert.equal(importeCorto(1000, 'USD'), 'U$S 1.000')
  assert.equal(importeCorto(null), null)
})
