import test from 'node:test'
import assert from 'node:assert/strict'
import { numeroCorto, resumenDeOrdenes } from './ordenesCliente.ts'

// LOS MISMOS NÚMEROS QUE `orquestador/lib/ordenes-cliente.test.mjs`, y a propósito: la regla del
// número canónico vive allá (se aplica al escribir) y acá se repite en TypeScript porque `src/` no
// importa del orquestador. Clavar los mismos casos es lo que hace que las dos no se separen en
// silencio — si una cambia sola, uno de los dos archivos se pone rojo.
//
// Los tests de `rotuloOrden`, `diaMes` e `importeCorto` se fueron con esas funciones el 10/09/2026:
// armaban el rótulo «OC 2256 · 02/09 · $12.100.000» que colgaba del nombre de la obra en la lista,
// y el dueño lo mandó sacar. Un test de una función que ya nadie llama es verde que no cuida nada.

test('el número que se dibuja es el corto, y el mismo para las tres formas de escribirlo', () => {
  assert.equal(numeroCorto('00002-00002162'), '2162')
  assert.equal(numeroCorto('02-00002162'), '2162')
  assert.equal(numeroCorto('0000000004865'), '4865')
  assert.equal(numeroCorto(null), null)
})

// ═══ EL RESUMEN DE UN GRUPO DE ÓRDENES ═══
//
// EL DEFECTO QUE ATRAPA, encontrado el 12/09/2026: la función comparaba `o.tipo === 'oc'` y la base
// guarda `'orden_compra'` (56 filas) y `'orden_pago'` (53). La comparación nunca era verdadera, así
// que los encabezados de cada trabajo en la solapa Órdenes salían VACÍOS —y un rótulo que no se
// dibuja no se parece a un error—. Lo destapó el pie de totales del cliente: «sin OC sin OP» sobre
// 109 órdenes cargadas. Vivía adentro del componente, donde ningún test podía llegar.

const PLATA = (n: number) => `$ ${n.toLocaleString('es-AR')}`

test('el resumen cuenta por el tipo que la BASE guarda, no por la sigla que se dibuja', () => {
  const ordenes = [
    { tipo: 'orden_compra', importe: 12_100_000 },
    { tipo: 'orden_compra', importe: 1_000_000 },
    { tipo: 'orden_pago', importe: 500_000 },
    { tipo: 'retencion', importe: 9 },
    { tipo: 'factura', importe: 9 },
  ]
  assert.equal(resumenDeOrdenes(ordenes, 'oc', true, PLATA), '2 OC · $ 13.100.000')
  assert.equal(resumenDeOrdenes(ordenes, 'op', true, PLATA), '1 OP · $ 500.000')
  // Las retenciones y las facturas NO son órdenes: contarlas inflaría lo que el cliente encargó.
  assert.equal(resumenDeOrdenes([{ tipo: 'retencion', importe: 9 }], 'oc', true, PLATA), null)
})

test('sin ninguna de ese tipo devuelve null, que no es «$ 0»', () => {
  assert.equal(resumenDeOrdenes([], 'oc', true, PLATA), null)
  assert.equal(resumenDeOrdenes([{ tipo: 'orden_pago', importe: 1 }], 'oc', true, PLATA), null)
})

test('un PDF sin importe se cuenta y marca el total como PARCIAL, nunca suma cero', () => {
  const ordenes = [
    { tipo: 'orden_compra', importe: 1_000_000 },
    { tipo: 'orden_compra', importe: null },
  ]
  assert.equal(resumenDeOrdenes(ordenes, 'oc', true, PLATA), '2 OC · $ 1.000.000 ·',
    'el punto final es lo único que dice que ese total no está completo')
})

test('sin permiso económico va la cuenta y NUNCA el importe', () => {
  // El importe de una orden de compra es precio de venta: el jefe de obra no lo ve.
  assert.equal(
    resumenDeOrdenes([{ tipo: 'orden_compra', importe: 12_100_000 }], 'oc', false, PLATA), '1 OC')
})
