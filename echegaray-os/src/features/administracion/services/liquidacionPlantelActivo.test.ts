import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ORIGEN_HEREDADO, plantelDeLaQuincena, tarifasHeredadas,
} from './liquidacionPlantelActivo.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//  1. Que la vista Liquidación siga mostrando a los 40 del padrón cuando esta quincena trabajaron
//     17. La lista larga esconde a los que faltan cargar entre los que no van.
//  2. Que «sacarlos de la vista» se convierta en sacarlos del plantel. Nadie desaparece: se cuentan.
//  3. Heredar un valor hora NULL o cero de la quincena anterior. Cero liquidaría en $ 0 con la misma
//     cara con la que se muestra un importe correcto.

const vacio = new Set<string>()
const PERSONAS = [{ id: 'p1', nombre: 'Aguero' }, { id: 'p2', nombre: 'Ramos' }, { id: 'p3', nombre: 'Zogbe' }]

test('una persona sin ninguna evidencia NO aparece, y una con línea en la anterior sí', () => {
  const r = plantelDeLaQuincena(PERSONAS, {
    conLineaEnLaAnterior: new Set(['p1']),
    conHoras: vacio, conAsistencia: vacio, conTarifaNueva: vacio,
  })
  assert.deepEqual(r.activas.map((p) => p.id), ['p1'])
  assert.deepEqual(r.sinActividad.map((p) => p.id), ['p2', 'p3'])
})

test('horas, asistencia o tarifa nueva alcanzan cada una por su cuenta', () => {
  assert.equal(plantelDeLaQuincena(PERSONAS, {
    conLineaEnLaAnterior: vacio, conHoras: new Set(['p2']), conAsistencia: vacio, conTarifaNueva: vacio,
  }).activas.length, 1)
  assert.equal(plantelDeLaQuincena(PERSONAS, {
    conLineaEnLaAnterior: vacio, conHoras: vacio, conAsistencia: new Set(['p3']), conTarifaNueva: vacio,
  }).activas.length, 1)
  assert.equal(plantelDeLaQuincena(PERSONAS, {
    conLineaEnLaAnterior: vacio, conHoras: vacio, conAsistencia: vacio, conTarifaNueva: new Set(['p3']),
  }).activas.length, 1)
})

test('nadie se pierde: activas + sinActividad es el plantel entero', () => {
  const r = plantelDeLaQuincena(PERSONAS, {
    conLineaEnLaAnterior: new Set(['p1']), conHoras: vacio, conAsistencia: vacio, conTarifaNueva: vacio,
  })
  assert.equal(r.activas.length + r.sinActividad.length, PERSONAS.length)
})

test('el $/h de la quincena nueva sale de la anterior, con desde = primer día de la quincena', () => {
  const t = tarifasHeredadas(
    [{ personaId: 'p1', valorHora: 5250 }, { personaId: 'p3', valorHora: 3400 }], '2026-09-01',
  )
  assert.deepEqual(t, [
    { personaId: 'p1', valorHora: 5250, desde: '2026-09-01', origen: ORIGEN_HEREDADO },
    { personaId: 'p3', valorHora: 3400, desde: '2026-09-01', origen: ORIGEN_HEREDADO },
  ])
})

test('una línea sin valor hora no hereda nada: nunca $ 0', () => {
  assert.deepEqual(tarifasHeredadas([{ personaId: 'p1', valorHora: null }], '2026-09-01'), [])
  assert.deepEqual(tarifasHeredadas([{ personaId: 'p1', valorHora: 0 }], '2026-09-01'), [])
})
