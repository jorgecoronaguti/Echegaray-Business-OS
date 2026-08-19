// LAS DOS LECTURAS DE HH QUE LA PANTALLA HACE POR SU CUENTA.
//
// ═══ DEFECTO 1: EL DESVÍO SIN LAS DOS PUNTAS ═══
//
// Sin `hh_plan` cargada, un `hh_real - (hh_plan ?? 0)` da 100% de sobreconsumo y una actividad sin
// planificar se lee como una catástrofe; al revés, tratar `hh_real` ausente como 0 lee una actividad
// sin imputar como perfectamente cumplida. Las dos son la misma clase de mentira: convertir un
// DESCONOCIDO en un número. Estos tests fijan que falte lo que falte, se DIGA cuál falta.
//
// ═══ DEFECTO 2: EL CRUCE PERSONA ↔ HORAS POR NOMBRE ═══
//
// Hasta el 19/08/2026 las horas se cruzaban con la asignación comparando NOMBRES normalizados,
// porque `registros_hh` guardaba texto libre. Con un apodo, una tilde o un segundo nombre, las horas
// de esa persona desaparecían de su fila SIN UN ERROR: la columna mostraba «—» y parecía que no
// había trabajado. Ahora se cruza por `persona_id`, y estos tests se ponen rojos si alguien vuelve
// al nombre.

import test from 'node:test'
import assert from 'node:assert/strict'
import { horasPorAsignado, lecturaProductividad } from './productividadHH.ts'
import type { ActividadHH, RegistroHH } from './personalService.ts'
import type { Asignacion } from '../types/index.ts'

const act = (p: Partial<ActividadHH>): ActividadHH => ({
  actividad_id: 'a1', obra_id: 'o1', nombre: 'Hormigón', tipo: 'tarea', orden: 1,
  avance_pct: null, hh_plan: null, hh_real: null, hh_extra: null, n_imputaciones: 0,
  desvio_pct: null, consumo_plan_pct: null, ...p,
})

test('sin HH plan no hay desvío: se dice que falta el plan', () => {
  assert.equal(lecturaProductividad(act({ hh_real: 120, avance_pct: 45 })), 'HH plan sin cargar')
})

test('sin horas imputadas no se lee 0% de consumo', () => {
  assert.equal(lecturaProductividad(act({ hh_plan: 100 })), 'sin horas imputadas')
})

test('con plan y horas pero sin avance medido, se dice que el avance falta', () => {
  const r = lecturaProductividad(act({ hh_plan: 100, hh_real: 73, consumo_plan_pct: 73 }))
  assert.match(r, /avance sin medir/)
  assert.match(r, /73%/)
})

test('con las tres puntas se lee el consumo adelantado', () => {
  const r = lecturaProductividad(act({ hh_plan: 100, hh_real: 73, consumo_plan_pct: 73, avance_pct: 45 }))
  assert.match(r, /Avance 45%/)
  assert.match(r, /HH consumidas 73%/)
  assert.match(r, /consumo adelantado/)
})

test('cuando el avance le gana al consumo, se dice que rinde mejor que el plan', () => {
  const r = lecturaProductividad(act({ hh_plan: 100, hh_real: 30, consumo_plan_pct: 30, avance_pct: 60 }))
  assert.match(r, /rinde mejor/)
})

test('a la par no se adjetiva: el ruido de ±10 puntos no es una señal', () => {
  const r = lecturaProductividad(act({ hh_plan: 100, hh_real: 50, consumo_plan_pct: 50, avance_pct: 46 }))
  assert.equal(r, 'Avance 46% · HH consumidas 50% del plan')
})

// ── EL CRUCE ────────────────────────────────────────────────────────────────────────────────────

const asignacion = (p: Partial<Asignacion>): Asignacion => ({
  id: 'as1', obra_id: 'o1', persona_id: 'p1', rol: 'integrante', cuadrilla: null,
  cuadrilla_id: null, actividad_id: null, desde: null, hasta: null, notas: null,
  persona_nombre: 'PEREZ JUAN', persona_especialidad: null, persona_categoria: null, ...p,
})

const registro = (p: Partial<RegistroHH>): RegistroHH => ({
  id: 'r1', obra_canonica_id: 'o1', persona_id: 'p1', trabajador_o_cuadrilla: null,
  persona_nombre: null, actividad_id: null, actividad_nombre: null, fecha: '2026-08-19',
  fecha_inicio_semana: '2026-08-17', horas: 8, tipo_hora: 'normal', categoria: null, notas: null, ...p,
})

test('las horas cruzan por id aunque el nombre esté escrito distinto', () => {
  const m = horasPorAsignado(
    [asignacion({ persona_nombre: 'Pérez, Juan Carlos' })],
    [registro({ horas: 8 }), registro({ id: 'r2', horas: 4 })],
  )
  assert.equal(m.get('as1'), 12)
})

test('una asignación a UNA actividad sólo suma las horas de esa actividad', () => {
  // Sin esto, alguien asignado a dos actividades vería la misma hora contada en las dos filas y el
  // total de la tabla no cerraría contra el titular.
  const m = horasPorAsignado(
    [asignacion({ id: 'as1', actividad_id: 'act-A' }), asignacion({ id: 'as2', actividad_id: 'act-B' })],
    [registro({ actividad_id: 'act-A', horas: 8 }), registro({ id: 'r2', actividad_id: 'act-B', horas: 5 })],
  )
  assert.equal(m.get('as1'), 8)
  assert.equal(m.get('as2'), 5)
})

test('las horas de otra persona no se le suman a nadie', () => {
  const m = horasPorAsignado([asignacion({})], [registro({ persona_id: 'p9' })])
  assert.equal(m.size, 0)
})

test('las filas legacy sin persona no se le cuelgan a un asignado', () => {
  // Las 19 filas históricas tienen `persona_id` en null y el nombre en texto libre. Colgárselas a
  // quien se llame parecido sería inventarle el dueño a 671 horas.
  const m = horasPorAsignado(
    [asignacion({})],
    [registro({ persona_id: null, trabajador_o_cuadrilla: 'PEREZ JUAN' })],
  )
  assert.equal(m.size, 0)
})
