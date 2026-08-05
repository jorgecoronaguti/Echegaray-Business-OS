// EL DEFECTO QUE ESTE TEST ATRAPA: el mismo comprobante listado cuatro veces en el cuadro que dice
// qué hay que cargar en Compras. Si se revierte el filtro, el primer test se pone rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { sinRepetidos, claveComprobante } from './arca-duplicados.mjs'

/** Las filas reales que el dueño vio repetidas en la pestaña Proveedores el 04/08. */
const LLITERAS = {
  nombre: 'MADERAS LLITERAS S.R.L.', cuit: '30-70839055-7',
  comprobante: '0006-00003449', fecha: '8/6/2026', importe: 60000,
}
const TRIELEC = {
  nombre: 'Trielec', cuit: '30-55864035-5',
  comprobante: '0038-00000888', fecha: '13/5/2026', importe: 1784747,
}

test('EL DEFECTO REAL: la misma factura cuatro veces se lista una sola vez', () => {
  const conRepetidos = [LLITERAS, LLITERAS, LLITERAS, LLITERAS, TRIELEC, TRIELEC]
  // Así se veía: seis filas y un TOTAL SIN CARGAR inflado en $180.000 + $1.784.747.
  assert.equal(conRepetidos.reduce((a, r) => a + r.importe, 0), 3809494)
  const limpio = sinRepetidos(conRepetidos)
  assert.equal(limpio.length, 2)
  assert.equal(limpio.reduce((a, r) => a + r.importe, 0), 1844747)
  // Y se queda con la PRIMERA aparición, no con una cualquiera: el orden del cuadro no se altera.
  assert.deepEqual(limpio, [LLITERAS, TRIELEC])
})

test('el mismo número con OTRO importe no es un duplicado: se muestran los dos', () => {
  // Es la misma razón por la que un cheque no se identifica por su número. Dos importes distintos
  // bajo el mismo comprobante es un problema real que tiene que verse, no fusionarse en silencio.
  const otro = { ...LLITERAS, importe: 61000 }
  assert.equal(sinRepetidos([LLITERAS, otro]).length, 2)
})

test('el mismo número de DOS emisores distintos no es un duplicado', () => {
  const otroEmisor = { ...LLITERAS, nombre: 'Otro SRL', cuit: '30-11111111-1' }
  assert.equal(sinRepetidos([LLITERAS, otroEmisor]).length, 2)
})

test('sin CUIT no se deduplica: fusionar borraría una compra real', () => {
  const a = { nombre: 'Proveedor A', cuit: null, comprobante: '0001-00000001', importe: 1000 }
  const b = { nombre: 'Proveedor B', cuit: '', comprobante: '0001-00000001', importe: 1000 }
  assert.equal(claveComprobante(a), null)
  assert.equal(sinRepetidos([a, b]).length, 2)
})

test('el CUIT con y sin guiones es el mismo CUIT', () => {
  const conGuiones = { ...LLITERAS, cuit: '30-70839055-7' }
  const sinGuiones = { ...LLITERAS, cuit: '30708390557' }
  assert.equal(claveComprobante(conGuiones), claveComprobante(sinGuiones))
  assert.equal(sinRepetidos([conGuiones, sinGuiones]).length, 1)
})

test('una lista vacía o sin comprobante no rompe', () => {
  assert.deepEqual(sinRepetidos([]), [])
  assert.deepEqual(sinRepetidos(), [])
  assert.equal(claveComprobante({ cuit: '30708390557' }), null)
})
