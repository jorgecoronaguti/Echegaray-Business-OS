import test from 'node:test'
import assert from 'node:assert/strict'
import { leerTipoCosto, tipoCostoDe } from './tipoCosto.ts'

const filas = [
  { obra_id: 'q', tipo_costo: 'Directo', en_costo: true, monto: '34256277', n: 20, origen: 'Compras · columna Tipo de Costo' },
  { obra_id: 'q', tipo_costo: 'Directo', en_costo: true, monto: '5857969', n: 3, origen: 'mano de obra propia por quincena: directo por definición' },
  { obra_id: 'l', tipo_costo: 'Directo', en_costo: true, monto: 45283162, n: 165, origen: 'Compras · columna Tipo de Costo' },
  { obra_id: 'l', tipo_costo: 'Estructura', en_costo: false, monto: 23821300, n: 14, origen: 'Compras · columna Tipo de Costo' },
  { obra_id: 'l', tipo_costo: 'Indirecto', en_costo: true, monto: 2626367, n: 5, origen: 'Compras · columna Tipo de Costo' },
  { obra_id: 'l', tipo_costo: 'sin tipo', en_costo: true, monto: 100, n: 1, origen: 'Compras · columna Tipo de Costo' },
]

test('Directo suma compras y mano de obra; Estructura se dice aparte y NO entra al costo; sin tipo no se asume directo', () => {
  const m = leerTipoCosto(filas)!
  const q = m.get('q')!
  assert.equal(q.directo, 34256277 + 5857969)
  assert.equal(q.manoObra, 5857969)
  assert.equal(q.indirecto, null)
  assert.equal(q.enCosto, q.directo)
  assert.equal(q.pctDirecto, 1)
  assert.equal(q.nComprobantes, 20, 'las quincenas no son comprobantes')
  const l = m.get('l')!
  assert.equal(l.estructuraEnMudanza, 23821300)
  assert.equal(l.enCosto, 45283162 + 2626367 + 100)
  assert.equal(l.sinTipo, 100)
  assert.ok(l.pctDirecto! > 0.94 && l.pctDirecto! < 0.95)
})

test('no se pudo leer (la migración no está aplicada) es null, no un mapa vacío; el Resumen suma las obras que tienen fila', () => {
  assert.equal(leerTipoCosto(null), null)
  assert.equal(leerTipoCosto({ message: 'function does not exist' }), null)
  const m = leerTipoCosto(filas)!
  const t = tipoCostoDe([{ id: 'q' }, { id: 'l' }, { id: 'sin-fila' }], m)!
  assert.equal(t.directo, 34256277 + 5857969 + 45283162)
  assert.equal(t.estructuraEnMudanza, 23821300)
  assert.equal(tipoCostoDe([{ id: 'q' }], null), null)
})
