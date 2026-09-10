import test from 'node:test'
import assert from 'node:assert/strict'
import { planDeReconciliacion } from './reconciliar-adjuntos.mjs'

const adj = (p = {}) => ({ id: p.id ?? 'a1', compra_clave: null, fila_compras: null, vinculado_por: 'registro', ...p })

test('la clave que ya empata con UNA fila sólo refresca el renglón', () => {
  const p = planDeReconciliacion(
    [adj({ compra_clave: 'c:30708390557|0003-00000967', fila_compras: 900 })],
    [{ fila: 932, clave: 'c:30708390557|0003-00000967', proveedor: 'Lliteras' }],
  )
  assert.deepEqual(p.refrescar, [{ id: 'a1', fila: 932 }])
  assert.equal(p.reasignar.length, 0)
})

// EL CASO REAL: el bot leyó el CUIT del papel y la fila del Sheet volvió sin CUIT. Mismo comprobante,
// dos claves. Sin esto la compra sale «sin comprobante» con el archivo guardado (5 casos al 10/09).
test('un c: y un p: del MISMO comprobante y proveedor se reasignan a la clave de la fila', () => {
  const p = planDeReconciliacion(
    [adj({ compra_clave: 'c:30691865386|0035-00005853', lectura: { proveedor: 'Combustibles Nuevo Cuyo' } })],
    [{ fila: 931, clave: 'p:combustibles nuevo cuyo|0035-00005853', proveedor: 'Combustibles Nuevo Cuyo' }],
  )
  assert.deepEqual(p.reasignar.map((r) => [r.clave, r.fila]), [['p:combustibles nuevo cuyo|0035-00005853', 931]])
})

// LO QUE NUNCA PUEDE PASAR: colgar el papel de un CUIT en la fila de otro. Es lo que hacía el atajo
// por número de renglón en la pantalla, y lo que este plan tiene que negarse a hacer.
test('dos CUIT distintos con el mismo número NO empatan: queda colgado', () => {
  const p = planDeReconciliacion(
    [adj({ compra_clave: 'c:20349213347|0003-00000967', fila_compras: 932 })],
    [{ fila: 932, clave: 'c:30708390557|0003-00000967', proveedor: 'Lliteras' }],
  )
  assert.equal(p.reasignar.length, 0)
  assert.equal(p.refrescar.length, 0)
  assert.equal(p.colgados.length, 1)
  assert.match(p.colgados[0].motivo, /ninguna fila/)
})

test('un número que aparece en dos filas no se resuelve adivinando', () => {
  const p = planDeReconciliacion(
    [adj({ compra_clave: 'c:30708390557|0003-00000967' })],
    [
      { fila: 10, clave: 'c:30708390557|0003-00000967', proveedor: 'Lliteras' },
      { fila: 11, clave: 'c:30708390557|0003-00000967', proveedor: 'Lliteras' },
    ],
  )
  assert.equal(p.colgados.length, 1)
  assert.match(p.colgados[0].motivo, /2 filas/)
})

test('lo que dijo una persona no se recalcula: sólo se le refresca el renglón', () => {
  const p = planDeReconciliacion(
    [adj({ compra_clave: 'c:27326890397|0001-00000067', vinculado_por: 'match_manual', fila_compras: 1, lectura: { proveedor: 'MASS CONSULTORA' } })],
    [{ fila: 924, clave: 'p:mass consultora|0001-00000067', proveedor: 'MASS CONSULTORA' }],
  )
  assert.deepEqual(p.refrescar, [{ id: 'a1', fila: 924 }])
  assert.equal(p.reasignar.length, 0)
})

test('el archivo sin clave no se cuelga de ninguna fila: se cuenta y se deja para que lo asignen', () => {
  const p = planDeReconciliacion([adj({ fila_compras: 700 })], [{ fila: 700, clave: 'p:dipot|0003-00002145' }])
  assert.equal(p.sinClave, 1)
  assert.equal(p.reasignar.length + p.refrescar.length, 0)
})

test('correr dos veces no cambia nada: el plan de un espejo ya reconciliado está vacío', () => {
  const filas = [{ fila: 931, clave: 'p:combustibles nuevo cuyo|0035-00005853', proveedor: 'Combustibles Nuevo Cuyo' }]
  const p = planDeReconciliacion([adj({ compra_clave: filas[0].clave, fila_compras: 931 })], filas)
  assert.deepEqual([p.refrescar, p.reasignar, p.colgados], [[], [], []])
})
