import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarParque } from './parque.ts'
import { planilla } from './planilla.ts'
import { activo, mov, ubicacion } from './fixture.test-util.ts'

test('la planilla de la obra: un renglón por ingreso, con su salida y la observación', () => {
  const p = armarParque({
    ubicaciones: [ubicacion({ id: 't', tipo: 'taller', nombre: 'Taller' }), ubicacion({ id: 'o', tipo: 'obra', obra_id: 'ob' })],
    obras: [{ id: 'ob', codigo: 'OB-0001', nombre: 'Galpón', estado: 'activa', cliente: null }],
    activos: [
      activo({ id: 'c2', codigo: 'CAS-002', nombre: 'Casco N° 2', ubicacion_id: 't' }),
      activo({ id: 'c3', codigo: 'CAS-003', nombre: 'Casco N° 3', ubicacion_id: 'o', estado: 'requiere_mantenimiento' }),
      activo({ id: 'x', codigo: 'PAL-001', nombre: 'Pala', ubicacion_id: 't' }),
    ],
    movimientos: [
      mov({ id: '1', activo_id: 'c2', origen_id: 't', destino_id: 'o', fecha_hora: '2026-09-15T12:00:00Z' }),
      mov({ id: '2', activo_id: 'c2', origen_id: 'o', destino_id: 't', fecha_hora: '2026-09-21T12:00:00Z', nota: 'vuelve roto' }),
      mov({ id: '3', activo_id: 'c3', origen_id: 't', destino_id: 'o', fecha_hora: '2026-09-15T12:00:00Z', nota: 'para la losa' }),
      mov({ id: '4', activo_id: 'x', origen_id: null, destino_id: 't', fecha_hora: '2026-09-01T12:00:00Z', nota: 'alta' }),
    ],
    incidencias: [], nombres: {},
  })
  const r = planilla(p, 'o')
  assert.deepEqual(r.map((x) => [x.activo.id, x.ingreso.slice(0, 10), x.salida?.slice(0, 10) ?? null, x.observacion]), [
    ['c2', '2026-09-15', '2026-09-21', 'vuelve roto'],
    ['c3', '2026-09-15', null, 'para la losa · requiere mantenimiento'],
  ])
  assert.deepEqual(planilla(p, 't').map((x) => [x.activo.id, x.observacion]), [['x', ''], ['c2', 'vuelve roto']], 'la nota automática «alta» no es observación; la de llegada sí')
})
