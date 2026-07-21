import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cruzar, verificar } from './cobertura-arca.mjs'

const norm = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
const clave = (c) => `${c.punto_venta}-${c.numero}`

test('empareja por número cuando el número está', () => {
  const r = cruzar(
    [{ tipo_comprobante: '1', emisor_nombre: 'ALUMETAL', punto_venta: '38', numero: '25267', imp_total: 100 }],
    [{ fila: 4, prov: 'ALUMETAL', total: 100, comprobante: '38-25267' }],
    { norm, clave },
  )
  assert.equal(r.porNumero.length, 1)
  assert.equal(r.faltan.length, 0)
})

test('empareja por proveedor+importe cuando falta el número — el caso ALUMETAL fila 669', () => {
  // La factura estaba cargada con el N° de comprobante VACÍO. Sin esta pasada, el OS la reportaba
  // como $18.166.381 "sin cargar" y alguien salía a buscarla.
  const r = cruzar(
    [{ tipo_comprobante: '1', emisor_nombre: 'ALUMETAL S A', punto_venta: '38', numero: '25267', imp_total: 18166381 }],
    [{ fila: 669, prov: 'ALUMETAL S A', total: 18166381, comprobante: '' }],
    { norm, clave },
  )
  assert.equal(r.porImporte.length, 1)
  assert.equal(r.porImporte[0].fila, 669)
  assert.equal(r.faltan.length, 0)
})

test('cada fila de Compras se consume UNA sola vez', () => {
  // Dos facturas del mismo importe contra una sola fila: la segunda TIENE que quedar como faltante.
  const r = cruzar(
    [
      { tipo_comprobante: '1', emisor_nombre: 'X', punto_venta: '1', numero: '1', imp_total: 500 },
      { tipo_comprobante: '1', emisor_nombre: 'X', punto_venta: '1', numero: '2', imp_total: 500 },
    ],
    [{ fila: 10, prov: 'X', total: 500, comprobante: '' }],
    { norm, clave },
  )
  assert.equal(r.porImporte.length, 1)
  assert.equal(r.faltan.length, 1)
})

test('una nota de crédito no es carga que falta', () => {
  const r = cruzar(
    [{ tipo_comprobante: '3', emisor_nombre: 'X', punto_venta: '1', numero: '9', imp_total: 700 }],
    [], { norm, clave },
  )
  assert.equal(r.faltan.length, 0, 'no manda a buscar un gasto que no existe')
  assert.equal(r.notas.length, 1)
  assert.equal(r.totales.neto, -700, 'resta del total')
})

test('un tipo desconocido se aparta y no ensucia ningún grupo', () => {
  const r = cruzar([{ tipo_comprobante: '777', emisor_nombre: 'X', punto_venta: '1', numero: '1', imp_total: 9 }], [], { norm, clave })
  assert.equal(r.desconocidos.length, 1)
  assert.equal(r.faltan.length, 0)
})

test('no empareja con un proveedor distinto aunque el importe coincida', () => {
  const r = cruzar(
    [{ tipo_comprobante: '1', emisor_nombre: 'ALUMETAL', punto_venta: '1', numero: '1', imp_total: 500 }],
    [{ fila: 4, prov: 'ACEROLATINA', total: 500, comprobante: '' }],
    { norm, clave },
  )
  assert.equal(r.faltan.length, 1)
})

test('el cruce CIERRA: los cuatro grupos reconstruyen el total neto', () => {
  // Sin este control, un comprobante que se cae de las cuatro listas desaparece sin que se note.
  const r = cruzar(
    [
      { tipo_comprobante: '1', emisor_nombre: 'A', punto_venta: '1', numero: '1', imp_total: 1000 },
      { tipo_comprobante: '1', emisor_nombre: 'B', punto_venta: '2', numero: '2', imp_total: 500 },
      { tipo_comprobante: '1', emisor_nombre: 'C', punto_venta: '3', numero: '3', imp_total: 300 },
      { tipo_comprobante: '3', emisor_nombre: 'A', punto_venta: '1', numero: '9', imp_total: 200 },
    ],
    [
      { fila: 4, prov: 'A', total: 1000, comprobante: '1-1' },
      { fila: 5, prov: 'B', total: 500, comprobante: '' },
    ],
    { norm, clave },
  )
  const v = verificar(r)
  assert.equal(v.ok, true, `no cierra: diferencia ${v.diferencia}, contados ${v.contados}/${v.esperados}`)
  assert.equal(r.totales.neto, 1600)
})

test('tolera la diferencia entre neto y total de una factura', () => {
  // Compras a veces guarda el neto y ARCA el total: 2% de margen.
  const r = cruzar(
    [{ tipo_comprobante: '1', emisor_nombre: 'X', punto_venta: '1', numero: '1', imp_total: 1000 }],
    [{ fila: 4, prov: 'X', total: 980, comprobante: '' }],
    { norm, clave },
  )
  assert.equal(r.porImporte.length, 1)
})
