import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DESTRABA_CANTIDAD, DESTRABA_PLAN, SIN_MEDIDA,
  medirActividad, resumenProductividad, type ActividadConHH,
} from './productividadHH.ts'

// EL DEFECTO QUE ESTOS TESTS ATRAPAN: que la pantalla publique un rendimiento donde no hay uno.
//
// Hoy `registros_hh` no guarda cantidad ejecutada ni unidad (§7 del handoff: es el pedido más caro y
// el más rentable). Con esa columna vacía hay tres maneras de fabricar el número que falta —usar el
// `pct` de avance como si fuera una cantidad, repartir las horas sin actividad entre las que sí la
// tienen, o llamar «rendimiento» al consumo de horas presupuestadas—, y las tres dan un número que
// se lee igual que uno medido. Si alguien las reintroduce, estos tests se ponen rojos.

const act = (a: Partial<ActividadConHH> = {}): ActividadConHH => ({
  actividadId: 'a1', etiqueta: 'Quattropani · Mampostería de elevación',
  hh: 248, hhPlan: 300, pct: 60, unidad: 'm²', cantidadEjecutada: 312, cantidadPlan: 316, ...a,
})

test('sin cantidad ejecutada: «no se puede medir» y qué lo destraba', () => {
  const l = medirActividad(act({ cantidadEjecutada: null, unidad: null, pct: 60 }))
  assert.equal(l.hhPorUnidadReal, null)
  assert.equal(l.hhPorUnidadPlan, null)
  assert.equal(l.rendimientoPct, null)
  assert.equal(l.porQueNoSeMide, SIN_MEDIDA)
  assert.equal(l.queLoDestraba, DESTRABA_CANTIDAD)
})

test('EL PCT DE AVANCE NO ES UNA CANTIDAD: 60 % no son 60 unidades', () => {
  // Es la salida fácil: `hh / pct` da un número que se ve como un rendimiento y no lo es.
  const l = medirActividad(act({ cantidadEjecutada: null, unidad: null, pct: 60, hh: 183 }))
  assert.equal(l.hhPorUnidadReal, null, 'el pct no puede completar la cantidad')
  assert.notEqual(l.hhPorUnidadReal, 183 / 60)
})

test('cantidad en cero no es cantidad: dividir daría Infinity', () => {
  const l = medirActividad(act({ cantidadEjecutada: 0 }))
  assert.equal(l.hhPorUnidadReal, null)
  assert.equal(l.porQueNoSeMide, SIN_MEDIDA)
})

test('con cantidad pero sin plan: hay HH/unidad real y no hay contra qué compararlo', () => {
  const l = medirActividad(act({ cantidadPlan: null, hhPlan: null }))
  assert.equal(l.hhPorUnidadReal, 0.79, '248 / 312')
  assert.equal(l.hhPorUnidadPlan, null)
  assert.equal(l.rendimientoPct, null, 'sin plan no hay rendimiento')
  assert.equal(l.queLoDestraba, DESTRABA_PLAN)
  assert.equal(l.consumoPlanPct, null)
})

test('medida entera: real, plan y el signo del rendimiento', () => {
  const l = medirActividad(act({ hh: 248, cantidadEjecutada: 312, hhPlan: 300, cantidadPlan: 316 }))
  assert.equal(l.hhPorUnidadReal, 0.79)
  assert.equal(l.hhPorUnidadPlan, 0.95)
  assert.equal(l.rendimientoPct, 16.8, 'positivo = mejor que el plan')
  assert.equal(l.porQueNoSeMide, null)
  // Peor que el plan tiene que dar NEGATIVO, no un valor absoluto.
  const peor = medirActividad(act({ hh: 386, cantidadEjecutada: 840, hhPlan: 320, cantidadPlan: 1000 }))
  assert.ok((peor.rendimientoPct ?? 0) < 0, `esperaba negativo, dio ${peor.rendimientoPct}`)
})

test('CONSUMO DE PLAN NO ES RENDIMIENTO, y por eso tiene otro nombre', () => {
  const l = medirActividad(act({ cantidadEjecutada: null, unidad: null, hh: 150, hhPlan: 300 }))
  assert.equal(l.consumoPlanPct, 50, 'gastó la mitad de las horas presupuestadas')
  assert.equal(l.rendimientoPct, null, 'y aun así no se sabe si rindió')
})

test('las horas sin actividad NO se reparten entre las que sí la tienen', () => {
  const lineas = [medirActividad(act()), medirActividad(act({ actividadId: 'a2', cantidadEjecutada: null, unidad: null }))]
  const r = resumenProductividad(lineas, 96)
  assert.equal(r.hhConActividad, 496, '248 + 248, sin las 96 huérfanas')
  assert.equal(r.hhSinActividad, 96, 'viven en su propia línea')
  assert.equal(r.medidas, 1)
  assert.equal(r.sinMedida, 1)
})
