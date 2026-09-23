import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarParque, rotuloUbicacion } from './parque.ts'
import { candidatosServicioTecnico, encimaDelProveedor, esLugarImprimible } from './servicioTecnico.ts'
import { ubicacion } from './fixture.test-util.ts'

const parque = () => armarParque({
  ubicaciones: [
    ubicacion({ id: 'u-taller', tipo: 'taller', nombre: 'Taller' }),
    ubicacion({ id: 'u-inter', tipo: 'servicio_tecnico', proveedor_id: 'p-inter' }),
    ubicacion({ id: 'u-viejo', tipo: 'servicio_tecnico', nombre: 'Servicio técnico sin identificar', archivada: true }),
    ubicacion({ id: 'u-dupec-arch', tipo: 'tercero', proveedor_id: 'p-dupec', archivada: true }),
  ],
  obras: [], activos: [], movimientos: [], incidencias: [], nombres: {},
  proveedores: [
    { id: 'p-dupec', nombre: 'DUPEC', cuit: '20287737824', rubro: null, rubro_deducido: 'Equipos' },
    { id: 'p-inter', nombre: 'INTERMOTOR', cuit: '30716476967', rubro: 'Servicio técnico', rubro_deducido: null },
    { id: 'p-abc', nombre: 'ABC Bombas', cuit: null, rubro: null, rubro_deducido: 'Servicio técnico' },
  ],
})

test('el lugar de un proveedor se llama como el proveedor: el nombre no se guarda dos veces', () => {
  const p = parque()
  assert.equal(rotuloUbicacion(p, 'u-inter'), 'INTERMOTOR')
  assert.equal(rotuloUbicacion(p, 'u-viejo'), 'Servicio técnico sin identificar', 'el semilla archivado sigue nombrando su historia')
})

test('la planilla (control físico) es de lugares propios: obra, taller, rodado', () => {
  assert.equal(esLugarImprimible('obra'), true)
  assert.equal(esLugarImprimible('taller'), true)
  assert.equal(esLugarImprimible('rodado'), true)
  assert.equal(esLugarImprimible('servicio_tecnico'), false)
  assert.equal(esLugarImprimible('tercero'), false)
})

test('candidatos: los del rubro primero (declarado o deducido), luego el resto; el que ya es lugar lo dice', () => {
  const c = candidatosServicioTecnico(parque())
  assert.deepEqual(c.map((x) => [x.proveedor.nombre, x.esDelRubro, x.ubicacionId]), [
    ['ABC Bombas', true, null],
    ['INTERMOTOR', true, 'u-inter'],
    ['DUPEC', false, null],   // su lugar está archivado: no cuenta como lugar vivo
  ])
  assert.deepEqual(candidatosServicioTecnico(parque(), '2028').map((x) => x.proveedor.nombre), ['DUPEC'], 'busca por CUIT')
  assert.deepEqual(candidatosServicioTecnico(parque(), 'motor').map((x) => x.proveedor.nombre), ['INTERMOTOR'])
})

test('arriba del nombre: rubro y CUIT, sólo lo que hay', () => {
  assert.deepEqual(encimaDelProveedor({ id: 'x', nombre: 'X', cuit: '20287737824', rubro: null, rubro_deducido: 'Equipos' }), ['Equipos', 'CUIT 20287737824'])
  assert.deepEqual(encimaDelProveedor({ id: 'x', nombre: 'X', cuit: null, rubro: null, rubro_deducido: null }), [])
})
