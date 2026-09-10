import test from 'node:test'
import assert from 'node:assert/strict'
import { diaMes, numeroCorto, ordenesParaFila, rotuloOrden, sinFilaPropia } from './ordenesCliente.ts'
import type { OrdenBreve } from './ordenesCliente.ts'

// LOS MISMOS NÚMEROS QUE `orquestador/lib/ordenes-cliente.test.mjs`, y a propósito: la regla del
// número canónico vive allá (se aplica al escribir) y acá se repite en TypeScript porque `src/` no
// importa del orquestador. Clavar los mismos casos es lo que hace que las dos no se separen en
// silencio — si una cambia sola, uno de los dos archivos se pone rojo.

const orden = (p: Partial<OrdenBreve>): OrdenBreve => ({
  id: p.id ?? 'x', tipo: p.tipo ?? 'orden_compra', numero: p.numero ?? null,
  fecha: p.fecha ?? null, importe: p.importe ?? null, obra_id: p.obra_id ?? null,
})

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

test('la OC 2162 es UN rótulo aunque haya llegado en dos mails', () => {
  const { visibles, resto } = ordenesParaFila([
    orden({ id: 'a', numero: '00002-00002162', fecha: '2026-08-05' }),
    orden({ id: 'b', numero: '02-00002162', fecha: '2026-08-21' }),
  ])
  assert.equal(resto, 0)
  assert.equal(visibles.length, 1)
  // La fecha del grupo es la de la ORDEN, no la del papel que llegó después.
  assert.equal(visibles[0].rotulo, 'OC 2162 · 05/08')
  assert.deepEqual(visibles[0].ids, ['a', 'b'])
})

test('con muchas órdenes: las 3 más recientes y «+N», nunca esconder en silencio', () => {
  const muchas = ['2026-09-08', '2026-08-05', '2026-07-15', '2026-06-01', '2026-05-01']
    .map((f, i) => orden({ id: `o${i}`, numero: `00002-0000200${i}`, fecha: f }))
  const { visibles, resto } = ordenesParaFila(muchas)
  assert.deepEqual(visibles.map((v) => v.rotulo), ['OC 2000 · 08/09', 'OC 2001 · 05/08', 'OC 2002 · 15/07'])
  assert.equal(resto, 2)
  assert.deepEqual(ordenesParaFila(undefined), { visibles: [], resto: 0 })
})

test('una orden de una obra CERRADA no desaparece: sube a la fila del cliente', () => {
  // MEDIDO el 10/09/2026: `/clientes` dibuja sólo las obras `activa`, y ocho de las once órdenes de
  // Messina con obra cuelgan de obras cerradas. Sin esta regla se atribuían y dejaban de verse:
  // atribuir mejor terminaba mostrando MENOS que antes.
  const delCliente = [
    orden({ id: 'a', obra_id: 'messina-playon-azufre' }),
    orden({ id: 'b', obra_id: 'limpieza-de-escombros' }),
    orden({ id: 'c', obra_id: null }),
  ]
  assert.deepEqual(sinFilaPropia(delCliente, ['messina-playon-azufre']).map((o) => o.id), ['b', 'c'])
  assert.deepEqual(sinFilaPropia(delCliente, []).map((o) => o.id), ['a', 'b', 'c'])
  assert.deepEqual(sinFilaPropia(undefined, []), [])
})
