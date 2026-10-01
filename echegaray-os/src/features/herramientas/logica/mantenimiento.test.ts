import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarParque } from './parque.ts'
import { colaDeMantenimiento } from './mantenimiento.ts'
import { activo, inc, ubicacion } from './fixture.test-util.ts'

const HOY = new Date('2026-09-21T18:00:00-03:00')

test('la cola separa obra, taller, externa y el resto; lo operativo y la baja no entran', () => {
  const p = armarParque({
    ubicaciones: [
      ubicacion({ id: 't', tipo: 'taller', nombre: 'Taller' }),
      ubicacion({ id: 'o', tipo: 'obra', obra_id: 'ob' }),
      ubicacion({ id: 's', tipo: 'servicio_tecnico', nombre: 'Bosch' }),
    ],
    obras: [],
    activos: [
      activo({ id: '1', codigo: 'HER-0001', nombre: 'A', ubicacion_id: 'o', estado: 'requiere_mantenimiento', estado_desde: '2026-08-30T12:00:00Z' }),
      activo({ id: '2', codigo: 'HER-0002', nombre: 'B', ubicacion_id: 'o', estado: 'fuera_servicio', estado_desde: '2026-09-04T12:00:00Z' }),
      activo({ id: '3', codigo: 'HER-0003', nombre: 'C', ubicacion_id: 't', estado: 'fuera_servicio', estado_desde: '2026-09-20T12:00:00Z' }),
      activo({ id: '4', codigo: 'HER-0004', nombre: 'D', ubicacion_id: 's', estado: 'reparacion_externa', estado_desde: '2026-08-11T12:00:00Z' }),
      activo({ id: '5', codigo: 'HER-0005', nombre: 'E', ubicacion_id: null, estado: 'requiere_mantenimiento' }),
      activo({ id: '6', codigo: 'HER-0006', nombre: 'F', ubicacion_id: 'o' }),
      activo({ id: '7', codigo: 'HER-0007', nombre: 'G', estado: 'baja', baja_motivo: 'perdida', baja_en: '2026-09-01T00:00:00Z' }),
    ],
    movimientos: [],
    incidencias: [inc({ id: 'i2', activo_id: '2', creado_en: '2026-09-18T12:00:00Z', texto: 'no enciende' })],
    nombres: {},
  })
  const c = colaDeMantenimiento(p, HOY)
  assert.deepEqual(c.en_obra.map((x) => x.activo.id), ['1', '2'], 'lo más viejo primero')
  assert.equal(c.en_obra[1].incidencia?.texto, 'no enciende')
  assert.equal(c.en_obra[1].dias, 3, 'los días cuentan desde el reporte abierto, no desde el estado')
  assert.deepEqual(c.en_taller.map((x) => x.activo.id), ['3'])
  assert.deepEqual(c.externa.map((x) => x.activo.id), ['4'])
  assert.deepEqual(c.otros.map((x) => x.activo.id), ['5'])
})

test('lo que está en el mecánico con arreglo cargado sale del cuadro de la cola: tiene el suyo y no se cuenta dos veces', () => {
  const p = armarParque({
    ubicaciones: [ubicacion({ id: 's', tipo: 'servicio_tecnico', nombre: 'Bosch' })],
    obras: [],
    activos: [
      activo({ id: '1', codigo: 'HER-0001', nombre: 'A', ubicacion_id: 's', estado: 'reparacion_externa' }),
      activo({ id: '2', codigo: 'HER-0002', nombre: 'B', ubicacion_id: 's', estado: 'reparacion_externa' }),
    ],
    movimientos: [], incidencias: [], nombres: {},
    eventos: [{ id: 'e1', activo_id: '1', tipo: 'reparacion', situacion: 'en_taller', fecha: '2026-09-20', km: null, descripcion: 'x', proveedor_id: null, taller_texto: 'Bosch',
      costo: null, compra_ref: null, proximo_km: null, proximo_fecha: null, ubicacion_origen: null, ubicacion_taller: 's', enviado_en: null, cerrado_en: null, cerrado_por: null,
      creado_en: '2026-09-20T10:00:00Z', creado_por: null }],
  })
  const c = colaDeMantenimiento(p, HOY)
  assert.deepEqual(c.externa.map((x) => x.activo.id), ['2'], 'el 2 sigue: está afuera SIN arreglo cargado, es lo que falta cargar')
})
