import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarParque } from './parque.ts'
import { controlDeUbicacion } from './planilla.ts'
import { activo, mov, ubicacion } from './fixture.test-util.ts'

function parque() {
  return armarParque({
    ubicaciones: [ubicacion({ id: 't', tipo: 'taller', nombre: 'Taller' }), ubicacion({ id: 'o', tipo: 'obra', obra_id: 'ob' })],
    obras: [{ id: 'ob', codigo: 'OB-0001', nombre: 'Galpón', estado: 'activa', cliente: null }],
    activos: [
      activo({ id: 'c2', codigo: 'CAS-002', nombre: 'Casco N° 2', categoria: 'Seguridad (EPP)', ubicacion_id: 't' }),
      activo({ id: 'c3', codigo: 'CAS-003', nombre: 'Casco N° 3', categoria: 'Seguridad (EPP)', ubicacion_id: 'o', estado: 'requiere_mantenimiento' }),
      activo({ id: 'am', codigo: 'AMO-001', nombre: 'Amoladora', categoria: 'Herramientas eléctricas', ubicacion_id: 'o' }),
      activo({ id: 'b', codigo: 'BAL-001', nombre: 'Balde · lote', categoria: 'Albañilería', ubicacion_id: 'o', cantidad: 8 }),
      activo({ id: 'x', codigo: 'PAL-001', nombre: 'Pala', ubicacion_id: 'o', estado: 'baja', baja_motivo: 'perdida', baja_en: '2026-09-10T00:00:00Z' }),
    ],
    movimientos: [
      mov({ id: '1', activo_id: 'c2', origen_id: 't', destino_id: 'o', fecha_hora: '2026-09-15T12:00:00Z', usuario_texto: 'Emiliano' }),
      mov({ id: '2', activo_id: 'c2', origen_id: 'o', destino_id: 't', fecha_hora: '2026-09-21T12:00:00Z', nota: 'vuelve roto' }),
      mov({ id: '3', activo_id: 'c3', origen_id: 't', destino_id: 'o', fecha_hora: '2026-09-15T12:00:00Z', usuario_texto: 'Emiliano' }),
      mov({ id: '4', activo_id: 'am', origen_id: 't', destino_id: 'o', fecha_hora: '2026-07-01T12:00:00Z', usuario_texto: 'Rodrigo' }),
      mov({ id: '5', activo_id: 'b', origen_id: null, destino_id: 'o', fecha_hora: '2026-09-20T12:00:00Z', importado: true, nota: 'importado' }),
    ],
    incidencias: [], nombres: {}, categorias: ['Herramientas eléctricas', 'Albañilería', 'Seguridad (EPP)'],
  })
}

test('el control de la obra: lo que hay hoy por categoría, en el orden de la lista, sin bajas', () => {
  const c = controlDeUbicacion(parque(), 'o', new Date('2026-09-22T12:00:00Z'))
  assert.deepEqual(c.porCategoria.map((g) => [g.categoria, g.filas.map((f) => f.activo.id)]),
    [['Herramientas eléctricas', ['am']], ['Albañilería', ['b']], ['Seguridad (EPP)', ['c3']]])
  assert.equal(c.activos, 3)
  assert.equal(c.unidades, 10, 'el lote cuenta su cantidad')
  const am = c.porCategoria[0].filas[0]
  assert.equal(am.dias, 83)
  assert.equal(am.trajo, 'Rodrigo')
  assert.deepEqual(c.conProblema.map((f) => f.activo.id), ['c3'])
})

test('los movimientos recientes: entradas y salidas de la ventana, sin lo importado, lo último primero', () => {
  const c = controlDeUbicacion(parque(), 'o', new Date('2026-09-22T12:00:00Z'))
  assert.deepEqual(c.ultimos.map((m) => [m.activo.id, m.sentido, m.otroLado, m.nota]),
    [['c2', 'salió', 'Taller', 'vuelve roto'], ['c2', 'entró', 'Taller', null], ['c3', 'entró', 'Taller', null]])
})
