import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activoElegido } from './activo-elegido.ts'
import { armarParque } from './parque.ts'
import { colaDeMantenimiento } from './mantenimiento.ts'
import { activo, ubicacion } from './fixture.test-util.ts'

// Códigos reales del parque tras la renumeración a 3 cifras (20260922T0900), incluido un rodado.
const parque = [{ codigo: 'ROD-007' }, { codigo: 'AMO-004' }, { codigo: 'ROD-0001' }, { codigo: 'HER-0042' }]

test('el código que la tabla pone en la URL abre su activo, rodado de 3 cifras incluido', () => {
  assert.equal(activoElegido('ROD-007', parque)?.codigo, 'ROD-007')
  assert.equal(activoElegido('AMO-004', parque)?.codigo, 'AMO-004')
})

test('los códigos anteriores de 4 cifras y lo tipeado a mano siguen resolviendo', () => {
  assert.equal(activoElegido('ROD-0001', parque)?.codigo, 'ROD-0001')
  assert.equal(activoElegido('her 42', parque)?.codigo, 'HER-0042')
  assert.equal(activoElegido('rod 7', parque)?.codigo, 'ROD-007')
  assert.equal(activoElegido('amo4', parque)?.codigo, 'AMO-004')
})

test('lo que no existe o viene vacío no abre nada', () => {
  assert.equal(activoElegido('ROD-099', parque), null)
  assert.equal(activoElegido('', parque), null)
  assert.equal(activoElegido(null, parque), null)
})

// Cada fila clickeable de Mantenimiento hace `?activo=<codigo>` con el código de la fila; la pantalla
// resuelve contra la misma `parque.activos` que alimenta las tablas, así que ninguna puede quedar muda.
test('toda fila de la cola (obra, taller, externa, otros) abre su activo, ROD-007 y AMO-004 incluidos', () => {
  const p = armarParque({
    ubicaciones: [ubicacion({ id: 't', tipo: 'taller', nombre: 'Taller' }), ubicacion({ id: 'o', tipo: 'obra', obra_id: 'ob' })],
    obras: [],
    activos: [
      activo({ id: '1', codigo: 'ROD-007', nombre: 'Hilux', clase: 'rodado', ubicacion_id: 'o', estado: 'requiere_mantenimiento' }),
      activo({ id: '2', codigo: 'AMO-004', nombre: 'Amoladora 9"', ubicacion_id: 't', estado: 'fuera_servicio' }),
      activo({ id: '3', codigo: 'EQU-0003', nombre: 'Compresor', clase: 'equipo', estado: 'requiere_mantenimiento' }),
    ],
    movimientos: [], incidencias: [], nombres: {},
  })
  const c = colaDeMantenimiento(p)
  const filas = [...c.en_obra, ...c.en_taller, ...c.externa, ...c.otros]
  assert.equal(filas.length, 3)
  for (const f of filas) assert.equal(activoElegido(f.activo.codigo, p.activos)?.id, f.activo.id, f.activo.codigo)
})
