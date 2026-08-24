// LO QUE ATRAPAN: que la 09 llame «ausente» a quien no fichó, que esconda a quien fichó sin estar
// asignado, y que publique una jornada cerrada sobre alguien que volvió a entrar.

import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoDeFila, hoyEnObra, SIN_CUADRILLA, type AsignadoDeObra, type MarcaDelDia } from './presenciaObra.ts'

const asignado = (p: Partial<AsignadoDeObra>): AsignadoDeObra => ({
  persona_id: 'p1', persona_nombre: 'Juan Tello', rol: 'integrante', cuadrilla: 'Cuadrilla 1',
  hasta: null, ...p,
})

const marca = (p: Partial<MarcaDelDia>): MarcaDelDia => ({
  persona_id: 'p1', nombre_completo: 'Juan Tello', categoria: 'oficial', puesto: null,
  entrada: '2026-08-24T10:05:00Z', salida: null, estado: 'activo',
  lat: null, lon: null, precision_m: null, ...p,
})

test('SIN MARCA ES «SIN FICHAR», NUNCA «AUSENTE»: no se declara una falta con la ausencia de un dato', () => {
  const r = hoyEnObra([asignado({})], [])
  assert.equal(r.sinFichar, 1)
  assert.equal(r.enObra, 0)
  const [fila] = r.grupos[0].filas
  assert.equal(estadoDeFila(fila).texto, 'sin fichar')
  assert.equal(estadoDeFila(fila).tono, 'nulo', 'no lleva punto: la ausencia de dato no es un estado')
})

test('cero marcas no es cero personas: el grupo sigue diciendo cuántos se esperaban', () => {
  const r = hoyEnObra([asignado({ persona_id: 'a' }), asignado({ persona_id: 'b' })], [])
  assert.equal(r.grupos[0].asignados, 2)
  assert.equal(r.grupos[0].presentes, 0)
})

test('quien fichó en esta obra SIN asignación vigente aparece igual, no se lo esconde', () => {
  const r = hoyEnObra([], [marca({ persona_id: 'x', nombre_completo: 'Externo' })])
  assert.equal(r.sinAsignacion, 1)
  assert.equal(r.grupos[0].cuadrilla, SIN_CUADRILLA)
  assert.equal(r.grupos[0].filas[0].asignado, false)
  assert.equal(r.grupos[0].asignados, 0, 'no estaba asignado: sumarlo inventaría un plantel')
})

test('la asignación CERRADA no cuenta como plantel de hoy', () => {
  const r = hoyEnObra([asignado({ hasta: '2026-07-31' })], [])
  assert.deepEqual(r.grupos, [])
  assert.equal(r.asignados, 0)
})

test('DOS MARCAS EL MISMO DÍA: gana la jornada abierta, no la que ya cerró', () => {
  // Cerró a mediodía y volvió a entrar. Publicar la cerrada diría que ya se fue.
  const r = hoyEnObra([asignado({})], [
    marca({ estado: 'cerrada', entrada: '2026-08-24T10:00:00Z', salida: '2026-08-24T15:00:00Z' }),
    marca({ estado: 'activo', entrada: '2026-08-24T16:00:00Z' }),
  ])
  assert.equal(r.enObra, 1)
  assert.equal(r.grupos[0].filas[0].marca?.entrada, '2026-08-24T16:00:00Z')
})

test('el que le falta la salida no se cuenta como en obra, y lo dice', () => {
  const r = hoyEnObra([asignado({})], [marca({ estado: 'falta_salida' })])
  assert.equal(r.enObra, 0)
  assert.equal(r.cerraron, 1)
  assert.equal(estadoDeFila(r.grupos[0].filas[0]).texto, 'falta la salida')
})

test('los grupos y las filas salen en orden estable: la lista no puede bailar entre dos cargas', () => {
  const r = hoyEnObra([
    asignado({ persona_id: 'c', persona_nombre: 'Zulema', cuadrilla: 'Cuadrilla 2' }),
    asignado({ persona_id: 'a', persona_nombre: 'Ana', cuadrilla: 'Cuadrilla 2' }),
    asignado({ persona_id: 'b', persona_nombre: 'Beto', cuadrilla: 'Cuadrilla 1' }),
  ], [])
  assert.deepEqual(r.grupos.map((g) => g.cuadrilla), ['Cuadrilla 1', 'Cuadrilla 2'])
  assert.deepEqual(r.grupos[1].filas.map((f) => f.nombre), ['Ana', 'Zulema'])
})

test('sin cuadrilla cargada la persona no desaparece: cae en su propio grupo', () => {
  const r = hoyEnObra([asignado({ cuadrilla: '   ' })], [])
  assert.equal(r.grupos[0].cuadrilla, SIN_CUADRILLA)
})
