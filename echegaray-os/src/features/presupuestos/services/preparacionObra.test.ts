import test from 'node:test'
import assert from 'node:assert/strict'

import {
  avisoDeLaSeleccion, bloqueosDeCreacion, checklistDeCreacion, estadoDePartida, filasDePreparacion,
  metodoPorDefecto, resumenDelPlan, seleccionables, type ConversionHecha, type DatosDePreparacion,
} from './preparacionObra.ts'
import type { PartidaValorizada } from '../types/index.ts'

const partida = (over: Partial<PartidaValorizada> = {}): PartidaValorizada => ({
  partida_id: over.partida_id ?? 'p1',
  cotizacion_id: 'c1',
  orden: 1,
  rubro: 'Hormigón armado',
  codigo: 'T1007',
  descripcion: 'Viga de fundación H17',
  cantidad: 5.67,
  unidad: 'm³',
  tarea_tipo_id: null,
  analisis_id: 'a1',
  metodo_medicion: null,
  subcontratada: false,
  precio_subcontrato: null,
  congelada: true,
  costo_unitario: 1000,
  hs_unitarias: 24.5,
  subtotal: 5670,
  hh: 139,
  sin_analisis: false,
  ...over,
})

const datos = (over: Partial<DatosDePreparacion> = {}): DatosDePreparacion => ({
  adjudicado: true, congelado: true, obraVinculada: true,
  jefeObra: 'R. Echegaray', inicioPlan: '2026-08-03', montoContratado: 34_200_000,
  driveCarpeta: 'abc', ...over,
})

// ═══ LA PARTIDA SIN CÓMPUTO NO SE PUEDE CONVERTIR ═══

test('una partida sin cantidad no es convertible y no entra en la selección', () => {
  const filas = filasDePreparacion([partida({ cantidad: null })], {})
  assert.equal(filas[0].estado, 'sin_computo')
  assert.equal(filas[0].destino, null)
  assert.equal(filas[0].metodo, null)
  // El defecto que atrapa: ofrecerla marcada. `convertir_partida_a_plan` la dejaría pasar —su
  // control de cierre sólo corre con cantidad no nula— y nacerían actividades con un objetivo que
  // nadie midió.
  assert.equal(seleccionables(filas).length, 0)
})

test('una partida ya convertida muestra los frentes que existen, no 1', () => {
  const hecha: Record<string, ConversionHecha> = { p1: { frentes: 3, actividades: 12, hh: 400 } }
  const filas = filasDePreparacion([partida()], hecha)
  assert.equal(filas[0].estado, 'convertida')
  assert.equal(filas[0].frentes, 3)
  assert.equal(seleccionables(filas).length, 0, 'una partida convertida se volvió a ofrecer')
})

test('estadoDePartida distingue las tres ausencias', () => {
  assert.equal(estadoDePartida({ cantidad: 5 }, undefined), 'convertible')
  assert.equal(estadoDePartida({ cantidad: null }, undefined), 'sin_computo')
  assert.equal(estadoDePartida({ cantidad: null }, { frentes: 1, actividades: 1, hh: null }), 'convertida')
})

// ═══ EL MÉTODO ═══

test('el método por defecto NUNCA es «pasos»: los pasos salen de una plantilla', () => {
  // El defecto que atrapa: marcar por pasos una actividad sin pasos cargados. El avance no se
  // puede medir de ninguna manera y la pantalla de avance queda muda.
  assert.equal(metodoPorDefecto({ metodo_medicion: null, subcontratada: false }), 'cantidad')
  assert.equal(metodoPorDefecto({ metodo_medicion: 'pasos', subcontratada: false }), 'pasos')
})

test('una partida subcontratada se mide por cantidad y la elección del usuario no la mueve', () => {
  // `convertir_partida_a_plan` fuerza `v_metodo := 'cantidad'` para los paquetes. Ofrecer otra cosa
  // sería un control que la base ignora.
  const filas = filasDePreparacion([partida({ subcontratada: true })], {}, { p1: 'pasos' })
  assert.equal(filas[0].metodo, 'cantidad')
})

test('el método elegido en la pantalla le gana al declarado en la partida', () => {
  const filas = filasDePreparacion([partida({ metodo_medicion: 'cantidad' })], {}, { p1: 'manual' })
  assert.equal(filas[0].metodo, 'manual')
})

// ═══ LO QUE SE LLEVA EL PLAN ═══

test('las HH del plan no cuentan como 0 la partida sin análisis', () => {
  const filas = filasDePreparacion(
    [partida({ partida_id: 'p1', hh: 139 }), partida({ partida_id: 'p2', hh: null })], {},
  )
  const r = resumenDelPlan(filas, new Set(['p1', 'p2']))
  assert.equal(r.hh, 139, 'la partida sin análisis se sumó como 0')
  assert.equal(r.sinAnalisis, 1)
  assert.equal(r.actividades, 2)
  assert.equal(r.frentes, 2)
})

test('sin ninguna partida con análisis, las HH del plan son null y no cero', () => {
  const filas = filasDePreparacion([partida({ hh: null })], {})
  assert.equal(resumenDelPlan(filas, new Set(['p1'])).hh, null)
})

test('el resumen ignora lo que no está seleccionado y lo que no es convertible', () => {
  const filas = filasDePreparacion(
    [partida({ partida_id: 'p1' }), partida({ partida_id: 'p2' }), partida({ partida_id: 'p3', cantidad: null })],
    {},
  )
  const r = resumenDelPlan(filas, new Set(['p1', 'p3']))
  assert.equal(r.actividades, 1, 'contó una partida sin cómputo o una no elegida')
  assert.equal(r.elegidas, 1)
})

// ═══ EL AVISO ═══

test('el aviso nombra primero lo más caro: sin análisis le gana a sin pasos', () => {
  const filas = filasDePreparacion([partida({ partida_id: 'p1', hh: null })], {})
  const r = resumenDelPlan(filas, new Set(['p1']))
  assert.match(avisoDeLaSeleccion(r) ?? '', /sin análisis/)
})

test('con todo analizado y medido por cantidad, el aviso habla de los pasos', () => {
  const filas = filasDePreparacion([partida()], {})
  assert.equal(avisoDeLaSeleccion(resumenDelPlan(filas, new Set(['p1']))), '1 sin pasos: su avance va a ser estimado')
})

test('sin selección no hay aviso', () => {
  assert.equal(avisoDeLaSeleccion(resumenDelPlan([], new Set())), null)
})

test('todo por pasos y con análisis no deja aviso', () => {
  const filas = filasDePreparacion([partida({ metodo_medicion: 'pasos' })], {})
  assert.equal(avisoDeLaSeleccion(resumenDelPlan(filas, new Set(['p1']))), null)
})

// ═══ ANTES DE CREAR ═══

test('sin congelar y sin adjudicar, la creación queda bloqueada', () => {
  const items = checklistDeCreacion(datos({ adjudicado: false, congelado: false }))
  const bloqueos = bloqueosDeCreacion(items)
  assert.deepEqual(bloqueos.map((b) => b.clave), ['adjudicado', 'congelado'])
})

test('el jefe de obra y el Drive faltantes NO bloquean: son deuda declarada', () => {
  const items = checklistDeCreacion(datos({ jefeObra: null, driveCarpeta: null, montoContratado: null }))
  assert.equal(bloqueosDeCreacion(items).length, 0)
  // Pero se dicen, con el porqué: un pendiente sin consecuencia escrita se deja de mirar.
  const jefe = items.find((i) => i.clave === 'jefe')!
  assert.equal(jefe.cumple, false)
  assert.equal(jefe.detalle, 'hace falta para cargar partes')
})

test('sin fecha de inicio la creación se bloquea: nadie inventa el arranque', () => {
  // El defecto que atrapa: poner hoy por defecto. Un default cómodo acá se convierte en un desvío
  // calculado contra una ficción tres meses después.
  const items = checklistDeCreacion(datos({ inicioPlan: null }))
  assert.deepEqual(bloqueosDeCreacion(items).map((b) => b.clave), ['inicio'])
})

test('con todo cargado no queda ningún pendiente', () => {
  const items = checklistDeCreacion(datos())
  assert.equal(items.filter((i) => !i.cumple).length, 0)
})
