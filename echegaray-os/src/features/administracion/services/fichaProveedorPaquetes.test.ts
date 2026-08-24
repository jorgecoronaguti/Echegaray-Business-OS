// LOS PAQUETES DE UN PROVEEDOR — el armado, probado sin base.
//
// Dos defectos que la ficha 23 puede cometer sin lanzar ningún error:
//
//   1. ESCRIBIR «$ 0» EN UN PAQUETE SIN PRECIO. `subcontrato.precio_contratado` es nullable a
//      propósito: un paquete previsto todavía no tiene precio pactado. `Number(null)` da 0, y ese 0
//      entra al total como si se hubiera contratado trabajo por nada.
//   2. MOSTRAR EL SLUG DE LA OBRA EN VEZ DE SU NOMBRE, o al revés: perder la fila entera cuando la
//      relación con `obra_canonica` no vino. Un paquete sin nombre de obra sigue siendo un paquete.

import test from 'node:test'
import assert from 'node:assert/strict'
import { armarPaquetes } from './fichaProveedor.ts'

const fila = (over: Record<string, unknown> = {}) => ({
  id: 'sc1', nombre: 'Tabiques de yeso', estado: 'contratado',
  precio_contratado: 3_500_000 as number | string | null, documentacion_ok: false,
  obra_id: 'escuela-san-juan', obra_canonica: { nombre: 'Escuela San Juan' },
  ...over,
})

test('un paquete sin precio queda en null, NO en cero', () => {
  const [p] = armarPaquetes([fila({ precio_contratado: null })] as never)
  assert.equal(p.precio, null)
  assert.notEqual(p.precio, 0)
})

test('el precio que llega como cadena se convierte a número, no se concatena', () => {
  const [p] = armarPaquetes([fila({ precio_contratado: '2800000.50' })] as never)
  assert.equal(p.precio, 2_800_000.5)
})

test('sin nombre de obra la fila NO se pierde: cae al slug', () => {
  const [p] = armarPaquetes([fila({ obra_canonica: null })] as never)
  assert.equal(p.obra, 'escuela-san-juan')
  assert.equal(p.trabajo, 'Tabiques de yeso')
})

test('PostgREST puede devolver la relación como arreglo y se lee igual', () => {
  const [p] = armarPaquetes([fila({ obra_canonica: [{ nombre: 'Depósito Norte' }] })] as never)
  assert.equal(p.obra, 'Depósito Norte')
})

test('los paquetes se ordenan por lo que pesan: primero el contrato más grande', () => {
  const filas = [
    fila({ id: 'a', precio_contratado: 1_200_000 }),
    fila({ id: 'b', precio_contratado: 3_500_000 }),
    fila({ id: 'c', precio_contratado: null }),
  ]
  assert.deepEqual(armarPaquetes(filas as never).map((p) => p.id), ['b', 'a', 'c'])
})
