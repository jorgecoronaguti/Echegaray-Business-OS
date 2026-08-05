// LOS DEFECTOS QUE ESTE TEST ATRAPA
//
//   (a) el mismo comprobante repetido llega a la pestaña — en CUALQUIERA de las secciones que
//       derivan del libro, no sólo en la que se miró primero;
//   (b) el dedup se vuelve goloso y fusiona dos comprobantes que son distintos de verdad.
//
// Los casos son los REALES, verificados contra `comprobantes_arca` el 04/08 con una consulta de
// agrupamiento (fuente distinta de este filtro): 14 grupos, 57 filas de más, ninguno con más de una
// fecha de emisión.

import test from 'node:test'
import assert from 'node:assert/strict'
import { sinComprobantesRepetidos, claveComprobante } from './arca-duplicados.mjs'

/** La nota de crédito de Trielec que el dueño vio CUATRO veces en la sección 3. */
const TRIELEC_NC = {
  tipo_comprobante: 112, emisor_nombre: 'Trielec', emisor_cuit: '30558640355',
  punto_venta: 38, numero: 3, fecha_emision: '2026-03-25', imp_total: 509980,
}
/** La factura de Maderas Lliteras que vio CUATRO veces en la sección 4. */
const LLITERAS = {
  tipo_comprobante: 81, emisor_nombre: 'MADERAS LLITERAS S.R.L.', emisor_cuit: '30708390557',
  punto_venta: 6, numero: 3449, fecha_emision: '2026-06-08', imp_total: 14999.99,
}

test('EL DEFECTO REAL: el mismo comprobante cuatro veces se usa una sola vez', () => {
  const libro = [TRIELEC_NC, TRIELEC_NC, TRIELEC_NC, TRIELEC_NC, LLITERAS, LLITERAS, LLITERAS, LLITERAS]
  const limpio = sinComprobantesRepetidos(libro)
  assert.equal(limpio.length, 2)
  assert.deepEqual(limpio, [TRIELEC_NC, LLITERAS], 'conserva el orden y la primera aparición')
})

test('LA LECCIÓN: se deduplica el LIBRO, así que toda derivación sale limpia', () => {
  // El primer arreglo filtraba `cruce.faltan` —una derivación— y por eso arregló la sección 4 y dejó
  // Trielec repetido en la 3. Este test fija la regla: lo que se limpia es la lista de la que salen
  // TODAS las secciones, así que una sección nueva nace limpia sin acordarse de filtrar.
  const libro = [TRIELEC_NC, TRIELEC_NC, LLITERAS, LLITERAS]
  const limpio = sinComprobantesRepetidos(libro)
  const esNota = (c) => c.tipo_comprobante === 112
  assert.equal(limpio.filter(esNota).length, 1, 'la derivación de notas de crédito sale sin repetidos')
  assert.equal(limpio.filter((c) => !esNota(c)).length, 1, 'y la de facturas también')
})

test('una factura y una nota de crédito con el MISMO número no son un duplicado', () => {
  // Tipo 81 (tique factura) y 112 (tique nota de crédito) comparten numeración por punto de venta.
  // Sin el tipo en la clave, la nota se comería la factura o al revés.
  const factura = { ...TRIELEC_NC, tipo_comprobante: 81 }
  assert.equal(sinComprobantesRepetidos([TRIELEC_NC, factura]).length, 2)
  assert.notEqual(claveComprobante(TRIELEC_NC), claveComprobante(factura))
})

test('el mismo número con OTRO importe no es un duplicado: se muestran los dos', () => {
  // Es la misma razón por la que un cheque no se identifica por su número. Dos importes distintos
  // bajo el mismo comprobante es un problema real que tiene que verse, no fusionarse en silencio.
  assert.equal(sinComprobantesRepetidos([LLITERAS, { ...LLITERAS, imp_total: 15999.99 }]).length, 2)
})

test('el mismo número de DOS emisores distintos no es un duplicado', () => {
  assert.equal(sinComprobantesRepetidos([LLITERAS, { ...LLITERAS, emisor_cuit: '30111111119' }]).length, 2)
})

test('en COMPRAS sin CUIT no se deduplica: fusionar borraría una compra real', () => {
  const a = { tipo_comprobante: 81, emisor_cuit: null, punto_venta: 1, numero: 1, imp_total: 1000 }
  const b = { tipo_comprobante: 81, emisor_cuit: '', punto_venta: 1, numero: 1, imp_total: 1000 }
  assert.equal(claveComprobante(a), null)
  assert.equal(sinComprobantesRepetidos([a, b]).length, 2)
})

test('en VENTAS el emisor es siempre la empresa: ahí SÍ se deduplica sin CUIT', () => {
  // El libro de ventas no trae emisor_cuit (el CUIT que viene es el del RECEPTOR). Como el emisor es
  // uno solo, punto de venta + número + importe alcanzan para la identidad.
  const v = { tipo_comprobante: 1, receptor_cuit: '30716699648', punto_venta: 1, numero: 220, imp_total: 37510000 }
  assert.equal(claveComprobante(v), null, 'sin la opción, no se arriesga')
  assert.equal(sinComprobantesRepetidos([v, v]).length, 2)
  assert.equal(sinComprobantesRepetidos([v, v], { emisorUnico: true }).length, 1)
})

test('el CUIT con y sin guiones es el mismo CUIT', () => {
  const conGuiones = { ...LLITERAS, emisor_cuit: '30-70839055-7' }
  assert.equal(claveComprobante(conGuiones), claveComprobante(LLITERAS))
})

test('un centavo de diferencia de punto flotante no parte un duplicado en dos', () => {
  const a = { ...LLITERAS, imp_total: 14999.99 }
  const b = { ...LLITERAS, imp_total: 14999.990000000002 }
  assert.equal(sinComprobantesRepetidos([a, b]).length, 1)
})

test('una lista vacía o un comprobante sin número no rompe', () => {
  assert.deepEqual(sinComprobantesRepetidos([]), [])
  assert.deepEqual(sinComprobantesRepetidos(), [])
  assert.equal(claveComprobante({ emisor_cuit: '30708390557' }), null)
})
