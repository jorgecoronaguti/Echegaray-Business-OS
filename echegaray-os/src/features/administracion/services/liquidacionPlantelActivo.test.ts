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

const persona = (id: string, p: Partial<{ enLaEmpresa: boolean; fechaIngreso: string | null; fechaEgreso: string | null; esPrueba: boolean; nombre: string; subcontratoId: string | null }> = {}) => ({
  id, nombre: p.nombre ?? id.toUpperCase(), enLaEmpresa: p.enLaEmpresa ?? true,
  // `in`, no `??`: un `fechaIngreso: null` explícito es el caso que se prueba, no un default.
  fechaIngreso: 'fechaIngreso' in p ? p.fechaIngreso ?? null : '2025-01-10', fechaEgreso: p.fechaEgreso ?? null, esPrueba: p.esPrueba ?? false,
  subcontratoId: p.subcontratoId ?? null,
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

// ═══ SIN FECHA DE INGRESO NO ES «DESDE SIEMPRE» (dueño, 15/09/2026) ═══
//
// «están mal las quincenas anteriores porque aparecen personas que son parte de un equipo de subcontratistas».
// MUTACIÓN QUE LO PONE ROJO: volver a `p.fechaIngreso == null || p.fechaIngreso <= q.hasta`.
const Q_MARZO = { desde: '2026-03-01', hasta: '2026-03-15' }

test('SIN FECHA DE INGRESO Y SIN ACTIVIDAD NO ENTRA A UNA QUINCENA VIEJA (Castro JM: egreso 12/08, alta 01/09)', () => {
  const castro = persona('castro-jm', { enLaEmpresa: false, fechaIngreso: null, fechaEgreso: '2026-08-12' })
  assert.deepEqual(plantelDeLaQuincena([castro], Q_MARZO, sin).activas, [], 'no estaba en marzo: nada lo ubica ahí')
  assert.deepEqual(plantelDeLaQuincena([castro], { desde: '2026-08-01', hasta: '2026-08-15' }, sin).activas, [],
    'ni siquiera en la quincena de su egreso, si no hay actividad')
  // Con un recibo de la quincena, sí: la actividad lo ubica.
  assert.deepEqual(plantelDeLaQuincena([castro], { desde: '2026-08-01', hasta: '2026-08-15' }, con('conRecibo', 'castro-jm')).activas.map((p) => p.id), ['castro-jm'])
})

test('SIN FECHA DE INGRESO PERO CON ACTIVIDAD SIGUE ENTRANDO (Jofre: horas en marzo)', () => {
  const jofre = persona('jofre', { enLaEmpresa: false, fechaIngreso: null, fechaEgreso: '2026-08-25' })
  assert.deepEqual(plantelDeLaQuincena([jofre], { desde: '2026-03-16', hasta: '2026-03-31' }, con('conHoras', 'jofre')).activas.map((p) => p.id), ['jofre'])
  assert.deepEqual(plantelDeLaQuincena([jofre], { desde: '2026-03-16', hasta: '2026-03-31' }, con('conLinea', 'jofre')).activas.length, 1)
})

test('EN LA EMPRESA SIN FECHA DE INGRESO Y SIN ACTIVIDAD: no entra, pero se cuenta en «sin actividad», no desaparece', () => {
  const r = plantelDeLaQuincena([persona('nuevo', { fechaIngreso: null })], Q_MARZO, sin)
  assert.deepEqual(r.activas, [])
  assert.deepEqual(r.sinActividad.map((p) => p.id), ['nuevo'])
})

test('CON FECHA DE INGRESO CARGADA RIGE LA FECHA, COMO ANTES', () => {
  const r = plantelDeLaQuincena([persona('reta', { fechaIngreso: '2025-05-26' }), persona('ochoa', { fechaIngreso: '2026-08-26' })], Q_MARZO, sin)
  assert.deepEqual(r.activas.map((p) => p.id), ['reta'])
})

// ═══ LA CUADRILLA DE UN SUBCONTRATISTA NO ES PLANTEL PROPIO (dueño, 15/09/2026) ═══
// MUTACIÓN QUE LO PONE ROJO: sacar el `if (p.subcontratoId)` → Moreno vuelve a la liquidación de agosto por su recibo.
test('CON SUBCONTRATO NO ENTRA NI CON RECIBO DE LA QUINCENA; se devuelve en deSubcontrato', () => {
  const moreno = persona('moreno', { enLaEmpresa: false, fechaIngreso: '2026-08-05', fechaEgreso: '2026-08-12', subcontratoId: 'sub-gerson' })
  const r = plantelDeLaQuincena([moreno, persona('reta')], { desde: '2026-08-01', hasta: '2026-08-15' }, con('conRecibo', 'moreno'))
  assert.deepEqual(r.activas.map((p) => p.id), ['reta'])
  assert.deepEqual(r.deSubcontrato.map((p) => p.id), ['moreno'])
  assert.equal(r.conActividad.has('moreno'), false)
  assert.deepEqual(r.sinActividad, [])
  // En una quincena donde no habría entrado, tampoco figura en deSubcontrato.
  assert.deepEqual(plantelDeLaQuincena([moreno], Q_MARZO, sin).deSubcontrato, [])
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
