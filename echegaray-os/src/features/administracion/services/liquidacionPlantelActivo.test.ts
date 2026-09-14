import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ORIGEN_HEREDADO, marcaDeBaja, plantelDeLaQuincena, tarifasHeredadas, type ActividadDeLaQuincena,
} from './liquidacionPlantelActivo.ts'

// CADA QUINCENA MUESTRA EL PLANTEL QUE TUVO ACTIVO (dueño, 14/09/2026).
//
// Textual: *«cada quincena tiene q mostrar el plantel q tuvo activo, no mostrar solo el activo actual»*.
// Se cortaba con `en_la_empresa = true`, el estado de HOY: una quincena vieja perdía a quien después se
// dio de baja. Regla: está en el plantel de [desde, hasta] quien
//   a) tuvo actividad en la quincena (horas, línea de liquidación, recibo, fila de JORNALES), o
//   b) sin actividad, ingresó a más tardar `hasta`, no egresó antes de `desde`, y está en la empresa o
//      tiene la fecha de egreso cargada. Una baja SIN fecha de egreso sólo entra por (a).
// Siempre fuera: `es_prueba` y las identidades de prueba.
//
// MUTACIÓN QUE LO PONE ROJO: volver a cortar por `en_la_empresa`.

const Q_AGOSTO = { desde: '2026-08-16', hasta: '2026-08-31' }
const vacio = new Set<string>()
const sin: ActividadDeLaQuincena = { conHoras: vacio, conLinea: vacio, conRecibo: vacio, conJornales: vacio }
const con = (campo: keyof ActividadDeLaQuincena, ...ids: string[]): ActividadDeLaQuincena => ({ ...sin, [campo]: new Set(ids) })

const persona = (id: string, p: Partial<{ enLaEmpresa: boolean; fechaIngreso: string | null; fechaEgreso: string | null; esPrueba: boolean; nombre: string }> = {}) => ({
  id, nombre: p.nombre ?? id.toUpperCase(), enLaEmpresa: p.enLaEmpresa ?? true,
  fechaIngreso: p.fechaIngreso ?? '2025-01-10', fechaEgreso: p.fechaEgreso ?? null, esPrueba: p.esPrueba ?? false,
})

test('UNA BAJA CON HORAS EN LA QUINCENA VIEJA APARECE', () => {
  const baja = persona('jofre', { enLaEmpresa: false, fechaEgreso: '2026-09-05' })
  const r = plantelDeLaQuincena([baja], Q_AGOSTO, con('conHoras', 'jofre'))
  assert.deepEqual(r.activas.map((p) => p.id), ['jofre'], 'MUTACIÓN: cortar por en_la_empresa la saca')
})

test('UNA BAJA CON FECHA DE EGRESO EN LA VENTANA APARECE AUNQUE NO TENGA ACTIVIDAD; ANTES DE LA VENTANA, NO', () => {
  const r = plantelDeLaQuincena([
    persona('dentro', { enLaEmpresa: false, fechaEgreso: '2026-08-20' }),
    persona('antes', { enLaEmpresa: false, fechaEgreso: '2026-08-10' }),
  ], Q_AGOSTO, sin)
  assert.deepEqual(r.activas.map((p) => p.id), ['dentro'])
})

test('UNA BAJA SIN FECHA DE EGRESO Y SIN ACTIVIDAD NO APARECE; CON UN RECIBO DEL PERÍODO, SÍ', () => {
  const sinFecha = persona('sosa', { enLaEmpresa: false, fechaEgreso: null })
  assert.deepEqual(plantelDeLaQuincena([sinFecha], Q_AGOSTO, sin).activas, [])
  assert.deepEqual(plantelDeLaQuincena([sinFecha], Q_AGOSTO, con('conRecibo', 'sosa')).activas.map((p) => p.id), ['sosa'])
  assert.deepEqual(plantelDeLaQuincena([sinFecha], Q_AGOSTO, con('conLinea', 'sosa')).activas.length, 1)
  assert.deepEqual(plantelDeLaQuincena([sinFecha], Q_AGOSTO, con('conJornales', 'sosa')).activas.length, 1)
})

test('QUIEN INGRESÓ DESPUÉS DE LA QUINCENA NO APARECE', () => {
  const r = plantelDeLaQuincena([persona('castillo', { fechaIngreso: '2026-09-01' })], Q_AGOSTO, sin)
  assert.deepEqual(r.activas, [])
  // No es una baja: se cuenta en «sin actividad», no desaparece.
  assert.deepEqual(r.sinActividad.map((p) => p.id), ['castillo'])
})

test('ES_PRUEBA NUNCA APARECE, NI CON ACTIVIDAD', () => {
  const qa = persona('qa', { esPrueba: true })
  const r = plantelDeLaQuincena([qa, persona('[PRUEBA E2E] QA Campo', { nombre: '[PRUEBA E2E] QA Campo' })], Q_AGOSTO, con('conHoras', 'qa', '[PRUEBA E2E] QA Campo'))
  assert.deepEqual(r.activas, [])
  assert.deepEqual(r.sinActividad, [])
})

test('LA QUINCENA EN CURSO: quien está en la empresa entra aunque todavía no tenga actividad', () => {
  const r = plantelDeLaQuincena([persona('aguero'), persona('rosales')], { desde: '2026-09-01', hasta: '2026-09-15' }, con('conHoras', 'aguero'))
  assert.deepEqual(r.activas.map((p) => p.id), ['aguero', 'rosales'])
  assert.ok(r.conActividad.has('aguero') && !r.conActividad.has('rosales'))
})

test('LA MARCA DE BAJA: «baja dd/mm» con fecha, «ya no está» sin fecha, nada si está en la empresa', () => {
  assert.deepEqual(marcaDeBaja({ enLaEmpresa: false, fechaEgreso: '2026-09-05' }),
    { texto: 'baja 05/09', titulo: 'Se dio de baja el 05/09/2026. Figura por la quincena que se está mirando.' })
  assert.deepEqual(marcaDeBaja({ enLaEmpresa: false, fechaEgreso: null }),
    { texto: 'ya no está', titulo: 'Ya no está en la empresa (sin fecha de egreso cargada). Figura por su actividad en esta quincena.' })
  assert.equal(marcaDeBaja({ enLaEmpresa: true, fechaEgreso: null }), null)
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
