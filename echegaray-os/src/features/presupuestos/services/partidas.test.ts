// LAS FILAS DE LA TABLA DE PARTIDAS.
//
// ═══ LOS DEFECTOS QUE ATRAPA ═══
//
// 1. EL SUBTOTAL DE RUBRO EN CERO. Un rubro cuyas partidas están todas sin análisis no cuesta $ 0:
//    cuesta lo que todavía no se cargó. Un `reduce` con acumulador 0 publica un cero que parece
//    una decisión de cotización.
// 2. LA PARTIDA SUBCONTRATADA QUE «NO LE FALTA NADA». La vista la marca `sin_analisis = false`
//    —correcto, no necesita análisis— pero si no tiene precio de subcontrato tampoco vale nada, y
//    ese hueco no lo denuncia ninguna columna del modelo.
// 3. EL ORDEN DE LOS RUBROS. Alfabético pelea con el orden que el administrador le dio a las
//    partidas: la fila que arrastró para arriba se le va abajo sola.

import test from 'node:test'
import assert from 'node:assert/strict'
import { filasDeLaTabla, filtrarPartidas, rubroDe, faltantesDe, subcontratadasFueraDelPrecio, SIN_RUBRO } from './partidas.ts'
import type { PartidaValorizada } from '../types/index.ts'

let n = 0
function part(over: Partial<PartidaValorizada> = {}): PartidaValorizada {
  n += 1
  return {
    partida_id: `pa${n}`, cotizacion_id: 'c1', orden: n, rubro: 'Fundaciones', codigo: `T${1000 + n}`,
    descripcion: `Partida ${n}`, cantidad: 2.16, unidad: 'm³', tarea_tipo_id: null, analisis_id: 'a1',
    metodo_medicion: null, subcontratada: false, precio_subcontrato: null, congelada: false,
    costo_unitario: 429057, hs_unitarias: 34, subtotal: 926763, hh: 73.44, sin_analisis: false,
    ...over,
  }
}

test('un rubro sin una sola partida valorizada NO vale $ 0: vale «sin cargar»', () => {
  const filas = filasDeLaTabla([
    part({ rubro: 'Vacío', subtotal: null, hh: null, sin_analisis: true, costo_unitario: null }),
  ], 100)
  const rubro = filas.find((f) => f.tipo === 'rubro')!
  assert.equal(rubro.tipo === 'rubro' && rubro.subtotal, null)
  assert.equal(rubro.tipo === 'rubro' && rubro.hh, null)
  assert.equal(rubro.tipo === 'rubro' && rubro.nSinAnalisis, 1)
})

test('el rubro suma sólo las partidas que tienen subtotal, y lo dice cuántas faltan', () => {
  const filas = filasDeLaTabla([
    part({ rubro: 'Fundaciones', subtotal: 100 }),
    part({ rubro: 'Fundaciones', subtotal: null, sin_analisis: true }),
  ], 100)
  const rubro = filas[0]
  assert.equal(rubro.tipo === 'rubro' && rubro.subtotal, 100)
  assert.equal(rubro.tipo === 'rubro' && rubro.nPartidas, 2)
  assert.equal(rubro.tipo === 'rubro' && rubro.nSinAnalisis, 1)
})

test('los rubros salen en el orden de sus partidas, no alfabético', () => {
  const filas = filasDeLaTabla([
    part({ rubro: 'Zapatas', orden: 1 }),
    part({ rubro: 'Albañilería', orden: 2 }),
    part({ rubro: 'Zapatas', orden: 3 }),
  ], 1000)
  const rubros = filas.filter((f) => f.tipo === 'rubro').map((f) => (f as { nombre: string }).nombre)
  assert.deepEqual(rubros, ['Zapatas', 'Albañilería'])
  // Y las partidas del primer rubro quedan juntas debajo de él.
  assert.deepEqual(filas.map((f) => f.tipo), ['rubro', 'partida', 'partida', 'rubro', 'partida'])
})

test('el rubro vacío o en null se llama «Sin rubro», no queda sin fila', () => {
  assert.equal(rubroDe({ rubro: null }), SIN_RUBRO)
  assert.equal(rubroDe({ rubro: '   ' }), SIN_RUBRO)
  assert.equal(rubroDe({ rubro: ' Fundaciones ' }), 'Fundaciones')
  const filas = filasDeLaTabla([part({ rubro: null })], 100)
  assert.equal(filas[0].tipo === 'rubro' && filas[0].nombre, SIN_RUBRO)
})

test('la incidencia de la partida se calcula contra el costo directo del presupuesto', () => {
  const filas = filasDeLaTabla([part({ subtotal: 926763 })], 131082400)
  const p = filas.find((f) => f.tipo === 'partida')!
  assert.equal(p.tipo === 'partida' && p.incidenciaPct!.toFixed(2), '0.71')
})

test('sin costo directo la incidencia es null: no se dibuja una barra sobre nada', () => {
  const filas = filasDeLaTabla([part()], null)
  const p = filas.find((f) => f.tipo === 'partida')!
  assert.equal(p.tipo === 'partida' && p.incidenciaPct, null)
})

test('una subcontratada sin precio tiene un hueco que ninguna columna del modelo denuncia', () => {
  assert.deepEqual(faltantesDe(part({ subcontratada: true, precio_subcontrato: null, sin_analisis: false })),
    ['sin precio de subcontrato'])
  assert.deepEqual(faltantesDe(part({ subcontratada: true, precio_subcontrato: 500000 })), [])
})

test('sin análisis y sin cómputo son dos ausencias distintas y se dicen las dos', () => {
  assert.deepEqual(faltantesDe(part({ sin_analisis: true, cantidad: null })), ['sin análisis', 'sin cómputo'])
  assert.deepEqual(faltantesDe(part()), [])
})

test('el buscador de partidas mira código, descripción y rubro', () => {
  const lista = [part({ codigo: 'T1009', descripcion: 'Columna H17', rubro: 'Fundaciones' })]
  assert.equal(filtrarPartidas(lista, 't1009').length, 1)
  assert.equal(filtrarPartidas(lista, 'columna').length, 1)
  assert.equal(filtrarPartidas(lista, 'fundac').length, 1)
  assert.equal(filtrarPartidas(lista, 'losa').length, 0)
  assert.equal(filtrarPartidas(lista, '   ').length, 1)
})

test('una subcontratada con precio NO entra en el costo directo — y la pantalla tiene que decirlo', () => {
  // Medido contra la base el 21/08/2026: `precio_subcontrato = 5.000.000` deja `costo_directo = 0`,
  // `precio_venta = 0` y `n_sin_analisis = 0`. El presupuesto se ve completo y le falta un paquete.
  const r = subcontratadasFueraDelPrecio([
    part({ subcontratada: true, precio_subcontrato: 5_000_000, subtotal: null, costo_unitario: null, sin_analisis: false }),
    part({ subcontratada: false, subtotal: 926763 }),
  ])
  assert.equal(r.n, 1)
  assert.equal(r.precioNoContado, 5_000_000)
})

test('una subcontratada que SÍ está valorizada no se denuncia dos veces', () => {
  const r = subcontratadasFueraDelPrecio([part({ subcontratada: true, precio_subcontrato: 500, subtotal: 500 })])
  assert.equal(r.n, 0)
})

test('sin subcontratadas no hay nada que avisar, y el monto no contado es null, no cero', () => {
  const r = subcontratadasFueraDelPrecio([part()])
  assert.equal(r.n, 0)
  assert.equal(r.precioNoContado, null)
})
