// D08, PROBADO CONTRA LAS FORMAS DE MENTIR QUE TIENE ESTA CIFRA.
//
// Cada caso es una manera concreta de publicar plata falsa en la ficha de un proveedor: inflar lo que
// salió de la caja sumando el total del comprobante en vez de lo rendido, escribir «0 %» cuando no se
// pudo leer lo comprado, o perder una entrega cuando dos personas pagaron la misma compra.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  entregaPorClave, resumirEfectivoDelProveedor, tituloDelEfectivo,
  type EfectivoRendidoDelProveedor,
} from './efectivoDelProveedor.ts'

const fila = (p: Partial<EfectivoRendidoDelProveedor>): EfectivoRendidoDelProveedor => ({
  clave: 'c:1|0001-1', fecha: '2026-09-22', comprobante: '0001-1', concepto: 'Hierro',
  monto_rendido: 1000, entrega: 'ER-0147', obra: 'Galpón 8', rindio: 'Rubén Sosa', ...p,
})

test('sin ninguna compra rendida, la cifra NO es cero: no existe', () => {
  const r = resumirEfectivoDelProveedor([], 1_000_000)
  assert.equal(r.rendido, null)
  assert.equal(r.porcentaje, null)
  assert.equal(tituloDelEfectivo(r), undefined)
})

test('suma lo RENDIDO, no el total del comprobante', () => {
  // Una compra de $ 100.000 pagada $ 30.000 en efectivo y el resto por transferencia. Sumar el total
  // diría que de la caja salieron $ 100.000 que nunca salieron.
  const r = resumirEfectivoDelProveedor([fila({ monto_rendido: 30_000 })], 100_000)
  assert.equal(r.rendido, 30_000)
  assert.equal(r.porcentaje, 30)
})

test('los montos que llegan como texto de Postgres se suman como números', () => {
  const r = resumirEfectivoDelProveedor(
    [fila({ monto_rendido: '96400.00' }), fila({ clave: 'c:1|0002-2', monto_rendido: '184200.50' })],
    1_000_000,
  )
  assert.equal(r.rendido, 280_600.5)
})

test('sin lo comprado no hay porcentaje, y no se inventa un 0 %', () => {
  for (const comprado of [null, 0]) {
    const r = resumirEfectivoDelProveedor([fila({ monto_rendido: 50_000 })], comprado)
    assert.equal(r.porcentaje, null, `comprado = ${comprado}`)
    assert.equal(r.rendido, 50_000)
    assert.ok(!(tituloDelEfectivo(r) ?? '').includes('%'))
  }
})

test('las manos no se repiten y conservan el orden en que aparecen', () => {
  const r = resumirEfectivoDelProveedor([
    fila({ rindio: 'Rubén Sosa' }),
    fila({ clave: 'c:1|0002-2', rindio: 'Diego Funes' }),
    fila({ clave: 'c:1|0003-3', rindio: 'Rubén Sosa' }),
    fila({ clave: 'c:1|0004-4', rindio: null }),
  ], 1_000_000)
  assert.deepEqual(r.manos, ['Rubén Sosa', 'Diego Funes'])
  assert.equal(r.comprobantes, 4)
})

test('una compra rendida por dos entregas conserva las dos', () => {
  const mapa = entregaPorClave([
    fila({ entrega: 'ER-0141' }),
    fila({ entrega: 'ER-0147' }),
    fila({ entrega: 'ER-0147' }),
    fila({ clave: null, entrega: 'ER-0150' }),
  ])
  assert.deepEqual(mapa, { 'c:1|0001-1': ['ER-0141', 'ER-0147'] })
})

test('el título dice el porcentaje, cuántos comprobantes y quiénes', () => {
  const r = resumirEfectivoDelProveedor([
    fila({ monto_rendido: 140_000 }),
    fila({ clave: 'c:1|0002-2', monto_rendido: 60_000, rindio: 'Diego Funes' }),
  ], 1_000_000)
  assert.equal(tituloDelEfectivo(r), '20 % de lo comprado · 2 comprobantes · Rubén Sosa, Diego Funes')
})
