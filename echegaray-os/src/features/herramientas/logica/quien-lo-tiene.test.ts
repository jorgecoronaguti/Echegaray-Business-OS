import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarParque, personaDelMovimiento, quienTieneEn } from './parque.ts'
import { libroDeMovimientos } from './movimientos.ts'
import { controlDeUbicacion } from './planilla.ts'
import { filasDeConstancia, type ItemTenido } from './constancia.ts'
import { historialDePersona } from './vestimenta.ts'
import { activo, mov, ubicacion } from './fixture.test-util.ts'
import type { Ajuste, Existencia } from '../types.ts'

// «QUIÉN LA MOVIÓ» ERA UN CONCEPTO ERRADO (dueño 30/09): en EPP y ropa la columna es QUIÉN LO TIENE, la persona
// asignada en `activo_existencia.persona_id`. Quien apretó el botón (el usuario del movimiento) no es eso.
const ubicaciones = [ubicacion({ id: 'u-t', tipo: 'taller', nombre: 'Taller' }), ubicacion({ id: 'u-o', tipo: 'obra', nombre: 'QP Salón' })]
const activos = [
  activo({ id: 'cas', codigo: 'CAS-001', clase: 'epp', categoria: 'EPP', nombre: 'Casco', cantidad: 2, ubicacion_id: 'u-o' }),
  activo({ id: 'am', codigo: 'AMO-001', nombre: 'Amoladora', ubicacion_id: 'u-o' }),
]
const existencias: Existencia[] = [
  { activo_id: 'cas', ubicacion_id: 'u-o', cantidad: 1, persona_id: 'per-1' },
  { activo_id: 'cas', ubicacion_id: 'u-o', cantidad: 1, persona_id: null },
  { activo_id: 'am', ubicacion_id: 'u-o', cantidad: 1, persona_id: null },
]
const movimientos = [
  // Administración (usuario u-adm) le entregó el casco a Juan: el «quién» del casco es Juan, no Administración.
  mov({ id: '1', activo_id: 'cas', origen_id: 'u-t', destino_id: 'u-o', fecha_hora: '2026-09-20T12:00:00Z', usuario_id: 'u-adm', persona_destino: 'per-1' }),
  mov({ id: '2', activo_id: 'am', origen_id: 'u-t', destino_id: 'u-o', fecha_hora: '2026-09-20T12:00:00Z', usuario_id: 'u-adm' }),
]
const p = () => armarParque({
  ubicaciones, activos, existencias, movimientos, obras: [], incidencias: [], nombres: { 'u-adm': 'Administración' }, personas: { 'per-1': 'Juan Pérez' },
})

test('quién lo tiene en un lugar sale de la asignación, no del último movimiento', () => {
  assert.equal(quienTieneEn(p(), 'cas', 'u-o'), 'Juan Pérez')
  assert.equal(quienTieneEn(p(), 'am', 'u-o'), '', 'una herramienta sin asignar no dice «Administración»: dice nadie')
  assert.equal(quienTieneEn(p(), 'cas', 'u-t'), '', 'en otro lugar no lo tiene nadie')
  assert.equal(quienTieneEn(p(), 'cas', null), '')
})

test('si la sesión no ve a la persona, dice «alguien» en vez de inventar el nombre del usuario que tipeó', () => {
  const sinNombres = armarParque({ ubicaciones, activos, existencias, movimientos, obras: [], incidencias: [], nombres: { 'u-adm': 'Administración' } })
  assert.equal(quienTieneEn(sinNombres, 'cas', 'u-o'), 'alguien')
})

test('el libro de movimientos: la persona es quien lo recibió; quien lo registró queda aparte', () => {
  const r = libroDeMovimientos(p(), { dias: null, ubicacion: null, usuario: null })
  const casco = r.find((x) => x.activos[0].id === 'cas')!
  assert.equal(casco.persona, 'Juan Pérez')
  assert.equal(casco.quien, 'Administración')
  assert.equal(r.find((x) => x.activos[0].id === 'am')!.persona, null, 'una herramienta no se asigna a nadie')
})

test('una devolución nombra a quien devolvió (persona_origen)', () => {
  assert.equal(personaDelMovimiento(p(), { persona_origen: 'per-1', persona_destino: null }), 'Juan Pérez')
  assert.equal(personaDelMovimiento(p(), { persona_origen: null, persona_destino: null }), null)
})

test('la planilla de la obra lista quién lo tiene, no quién lo trajo', () => {
  const c = controlDeUbicacion(p(), 'u-o', new Date('2026-09-22T12:00:00Z'))
  const filas = c.porCategoria.flatMap((g) => g.filas)
  assert.equal(filas.find((f) => f.activo.id === 'cas')!.tiene, 'Juan Pérez')
  assert.equal(filas.find((f) => f.activo.id === 'am')!.tiene, '')
})

test('el historial de la persona dice el motivo de la baja (pérdida, descarte) y quién entregó', () => {
  const ajustes: Ajuste[] = [
    { id: 'a1', activo_id: 'cas', ubicacion_id: 'u-o', persona_id: 'per-1', antes: 2, despues: 1, motivo: 'perdida', detalle: 'se cayó del andamio', usuario_id: 'u-adm', creado_en: '2026-09-25T12:00:00Z' },
  ]
  const h = historialDePersona('per-1', movimientos, ajustes)
  const baja = h.find((e) => e.tipo === 'baja')!
  assert.equal(baja.motivo, 'perdida')
  assert.equal(baja.cantidad, 1)
  assert.equal(h.find((e) => e.tipo === 'entrega')!.usuarioId, 'u-adm')
  assert.equal(h.find((e) => e.tipo === 'entrega')!.motivo, null)
})

test('la constancia lleva sólo lo que la persona tiene y lo seleccionado; sin fecha no inventa una', () => {
  const tiene: ItemTenido[] = [
    { activoId: 'cas', codigo: 'CAS-001', nombre: 'Casco', talle: null, clase: 'epp', cantidad: 1, fecha: '2026-09-20T12:00:00Z', yaLaTenia: false, marca: '3M', modelo: 'H-700' },
    { activoId: 'cm', codigo: 'CAM-002', nombre: 'Camisa', talle: 'M', clase: 'ropa', cantidad: 2, fecha: null, yaLaTenia: true, marca: null, modelo: null },
    { activoId: 'cero', codigo: 'X', nombre: 'Nada', talle: null, clase: 'epp', cantidad: 0, fecha: null, yaLaTenia: false, marca: null, modelo: null },
  ]
  const todas = filasDeConstancia(tiene)
  assert.deepEqual(todas.map((f) => f.activoId), ['cas', 'cm'], 'lo que tiene 0 no se firma')
  assert.equal(todas[0].marcaModelo, '3M · H-700')
  assert.equal(todas[0].anterior, false)
  assert.equal(todas[1].anterior, true, 'lo anterior al sistema sale «sin fecha registrada»')
  assert.equal(todas[1].marcaModelo, null)
  assert.deepEqual(filasDeConstancia(tiene, new Set(['cm'])).map((f) => f.activoId), ['cm'])
})
