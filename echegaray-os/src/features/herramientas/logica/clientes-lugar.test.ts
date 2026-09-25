import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarParque } from './parque.ts'
import { activosDelCliente, clientesConObras, esReimputacion, SIN_CLIENTE } from './clientes-lugar.ts'
import { libroDeMovimientos } from './movimientos.ts'
import { activo, mov, ubicacion } from './fixture.test-util.ts'

const p = () => armarParque({
  ubicaciones: [
    ubicacion({ id: 'u-t', tipo: 'taller', nombre: 'Taller' }),
    ubicacion({ id: 'u-a', tipo: 'obra', obra_id: 'oa' }),
    ubicacion({ id: 'u-b', tipo: 'obra', obra_id: 'ob' }),
    ubicacion({ id: 'u-c', tipo: 'obra', obra_id: 'oc' }),
    ubicacion({ id: 'u-s', tipo: 'obra', obra_id: 'os' }),
  ],
  obras: [
    { id: 'oa', codigo: 'OB-0010', nombre: 'ENTREPISO', estado: 'activa', cliente: 'San Francisco', cliente_id: 'c-sf' },
    { id: 'ob', codigo: 'OB-0011', nombre: 'ESCALERA', estado: 'activa', cliente: 'San Francisco', cliente_id: 'c-sf' },
    { id: 'oc', codigo: 'OB-0022', nombre: 'PLAYÓN', estado: 'activa', cliente: 'Messina', cliente_id: 'c-me' },
    { id: 'os', codigo: 'OB-0030', nombre: 'SUELTA', estado: 'activa', cliente: null, cliente_id: null },
  ],
  activos: [
    activo({ id: 'bal', codigo: 'BAL-001', nombre: 'Balde · lote', cantidad: 8 }),
    activo({ id: 'amo', codigo: 'AMO-001', nombre: 'Amoladora' }),
    activo({ id: 'pal', codigo: 'PAL-001', nombre: 'Pala' }),
    activo({ id: 'pic', codigo: 'PIC-001', nombre: 'Pico' }),
  ],
  existencias: [
    { activo_id: 'bal', ubicacion_id: 'u-a', cantidad: 5 }, { activo_id: 'bal', ubicacion_id: 'u-b', cantidad: 3 },
    { activo_id: 'amo', ubicacion_id: 'u-a', cantidad: 1 },
    { activo_id: 'pal', ubicacion_id: 'u-c', cantidad: 1 },
    { activo_id: 'pic', ubicacion_id: 'u-s', cantidad: 1 },
  ],
  movimientos: [mov({ id: 'm1', activo_id: 'amo', origen_id: 'u-b', destino_id: 'u-a', fecha_hora: '2026-09-25T10:00:00Z' })],
  incidencias: [], nombres: {},
})

test('las obras se agrupan por cliente; el lote repartido en dos obras del mismo cliente cuenta una vez', () => {
  const c = clientesConObras(p())
  assert.deepEqual(c.map((x) => [x.clave, x.nombre, x.n, x.unidades, x.obras.map((o) => o.ubicacionId)]), [
    ['c-sf', 'San Francisco', 2, 9, ['u-a', 'u-b']],
    ['c-me', 'Messina', 1, 1, ['u-c']],
    [SIN_CLIENTE, null, 1, 1, ['u-s']],
  ])
})

test('el cliente suma lo de todas sus obras y se puede ver por obra', () => {
  const parque = p()
  const [sf] = clientesConObras(parque)
  const todo = activosDelCliente(parque, sf)
  assert.deepEqual(todo.map((x) => [x.activo.id, x.total, x.porObra.map((o) => o.cantidad)]), [['amo', 1, [1]], ['bal', 8, [5, 3]]])
  assert.deepEqual(activosDelCliente(parque, sf, 'u-b').map((x) => [x.activo.id, x.total]), [['bal', 3]])
})

test('entre obras del mismo cliente es reimputación; con el Taller, otro cliente o sin cliente, no', () => {
  const parque = p()
  assert.equal(esReimputacion(parque, 'u-a', 'u-b'), true)
  assert.equal(esReimputacion(parque, 'u-a', 'u-c'), false)
  assert.equal(esReimputacion(parque, 'u-t', 'u-a'), false)
  assert.equal(esReimputacion(parque, 'u-s', 'u-s'), false)
  assert.equal(esReimputacion(parque, null, 'u-a'), false)
})

test('el libro de movimientos marca la reimputación', () => {
  const r = libroDeMovimientos(p(), { dias: null, ubicacion: null, usuario: null })
  assert.deepEqual(r.map((x) => x.reimputacion), [true])
})
