import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarParque } from './parque.ts'
import { rotuloQueHay, rotuloVerificar, textoMoverDelLugar, verificablesDelLugar, verificablesDelParque } from './acciones-lugar.ts'
import { activo, ubicacion } from './fixture.test-util.ts'

const p = armarParque({
  ubicaciones: [ubicacion({ id: 't', tipo: 'taller', nombre: 'Taller' }), ubicacion({ id: 'u1', tipo: 'obra', obra_id: 'ob1' })],
  obras: [{ id: 'ob1', codigo: 'OB-0012', nombre: 'PISOS', estado: 'activa', cliente: null }],
  activos: [
    activo({ id: 'h', codigo: 'AMO-0001', nombre: 'Amoladora', ubicacion_id: 'u1' }),
    activo({ id: 'r', codigo: 'ROD-0001', nombre: 'Hilux', clase: 'rodado', patente: 'AB123CD', ubicacion_id: 'u1' }),
    activo({ id: 'e1', codigo: 'EQU-0001', nombre: 'Hormigonera', clase: 'equipo', ubicacion_id: 'u1' }),
    activo({ id: 'e2', codigo: 'EQU-0002', nombre: 'Compactadora', clase: 'equipo', ubicacion_id: 'u1' }),
    activo({ id: 'e3', codigo: 'EQU-0003', nombre: 'Vibrador', clase: 'equipo', ubicacion_id: 'u1' }),
    activo({ id: 'e4', codigo: 'EQU-0004', nombre: 'Bomba', clase: 'equipo', ubicacion_id: 't' }),
    activo({ id: 'b', codigo: 'EQU-0005', nombre: 'Baja', clase: 'equipo', estado: 'baja', ubicacion_id: null }),
  ],
  movimientos: [], incidencias: [], nombres: {},
})

test('en el lugar se ofrecen sólo rodados y máquinas, hasta tres; las herramientas no se verifican', () => {
  const ids = verificablesDelLugar(p, 'u1').map((a) => a.id)
  assert.equal(ids.length, 3)
  assert.ok(!ids.includes('h'))
  assert.ok(!ids.includes('e4'))
  assert.deepEqual(verificablesDelLugar(p, 'u1', 10).map((a) => a.id).sort(), ['e1', 'e2', 'e3', 'r'])
  assert.deepEqual(verificablesDelLugar(p, null), [])
})

test('la lista del parque entero deja afuera lo dado de baja y ordena por nombre', () => {
  assert.deepEqual(verificablesDelParque(p).map((a) => a.nombre), ['Bomba', 'Compactadora', 'Hilux', 'Hormigonera', 'Vibrador'])
})

test('los rótulos son los del teléfono', () => {
  assert.equal(rotuloVerificar({ clase: 'rodado', nombre: 'Hilux', patente: 'AB123CD' }), 'Verificar el rodado AB123CD')
  assert.equal(rotuloVerificar({ clase: 'rodado', nombre: 'Hilux', patente: null }), 'Verificar el rodado Hilux')
  assert.equal(rotuloVerificar({ clase: 'equipo', nombre: 'Hormigonera', patente: null }), 'Verificar Hormigonera')
  assert.equal(rotuloQueHay(true), 'Qué hay en esta obra')
  assert.equal(rotuloQueHay(false), 'Qué hay acá')
})

test('el botón de mover dice cuántas van; sin marcas, en escritorio, va todo', () => {
  assert.equal(textoMoverDelLugar(1, 5), 'Mover 1')
  assert.equal(textoMoverDelLugar(4, 5), 'Mover las 4')
  assert.equal(textoMoverDelLugar(0, 5), 'Mover todo · 5')
  assert.equal(textoMoverDelLugar(0, 0), 'Mover')
})
