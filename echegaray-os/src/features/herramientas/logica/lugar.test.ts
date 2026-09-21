import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarParque } from './parque.ts'
import { conLugar, lugaresParaElegir, resolverLugar } from './lugar.ts'
import { activo, ubicacion } from './fixture.test-util.ts'
import type { ObraIndice } from '../types.ts'

const obras: ObraIndice[] = [
  { id: 'ob1', codigo: 'OB-0012', nombre: 'PISOS ARCOR', estado: 'activa', cliente: null },
  { id: 'ob2', codigo: 'OB-0031', nombre: 'NAVE', estado: 'activa', cliente: null },
  { id: 'ob3', codigo: 'OB-0002', nombre: 'VIEJA', estado: 'finalizada', cliente: null },
]
const p = armarParque({
  ubicaciones: [ubicacion({ id: 't', tipo: 'taller', nombre: 'Taller' }), ubicacion({ id: 'u1', tipo: 'obra', obra_id: 'ob1' })],
  obras,
  activos: [activo({ id: 'a', codigo: 'HER-0001', nombre: 'A', ubicacion_id: 'u1' })],
  movimientos: [], incidencias: [], nombres: {},
})

test('la obra con ubicación se resuelve a su ubicación; la que no tiene, queda por obra y vacía', () => {
  assert.deepEqual(resolverLugar(p, obras, 'obra:ob1'), { clave: 'u:u1', rotulo: 'OB-0012 · PISOS ARCOR', ubicacionId: 'u1', esObra: true })
  assert.deepEqual(resolverLugar(p, obras, 'obra:ob2'), { clave: 'obra:ob2', rotulo: 'OB-0031 · NAVE', ubicacionId: null, esObra: true })
  assert.equal(resolverLugar(p, obras, 'obra:nada'), null)
  assert.equal(resolverLugar(p, obras, null), null)
})

test('para elegir: el Taller primero, después sólo obras activas', () => {
  assert.deepEqual(lugaresParaElegir(p, obras).map((x) => [x.clave, x.cuenta]), [['u:t', 0], ['u:u1', 1], ['obra:ob2', 0]])
})

test('el lugar viaja en la URL', () => {
  assert.equal(conLugar('/campo/herramientas/buscar', 'u:u1'), '/campo/herramientas/buscar?en=u%3Au1')
  assert.equal(conLugar('/x?q=1', 'obra:ob2'), '/x?q=1&en=obra%3Aob2')
  assert.equal(conLugar('/x', null), '/x')
})
