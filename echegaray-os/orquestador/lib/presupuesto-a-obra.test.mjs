import test from 'node:test'
import assert from 'node:assert/strict'
import { VEREDICTO, CONCEPTOS, auditarPartida, resumirTraspaso } from './presupuesto-a-obra.mjs'

// Una partida cotizada completa: tiene tipo, rubro, unidad, cómputo, horas unitarias y una
// composición congelada con material, equipo y mano de obra.
const PARTIDA = {
  id: 'p-1', descripcion: 'VIGA DE ENCADENADO H17', rubro: 'ESTRUCTURA', unidad: 'm3',
  cantidad: 2.08, tarea_tipo_id: 'tt-1', analisis_id: 'an-1', hs_unitarias: 34.3, subcontratada: false,
}
const COMPOSICION = [
  { orden: 0, recurso_codigo: 'MO-OF', recurso_nombre: 'OFICIAL', tipo: 'mano_obra', cantidad: 18.1 },
  { orden: 4, recurso_codigo: 'CEM', recurso_nombre: 'CEMENTO PORTLAND', tipo: 'material', cantidad: 300 },
  { orden: 9, recurso_codigo: 'FE10', recurso_nombre: 'HIERRO TORSIONADO ø 10', tipo: 'material', cantidad: 100, desperdicio: 0.05 },
  { orden: 12, recurso_codigo: 'VIB', recurso_nombre: 'VIBRADOR', tipo: 'equipo', cantidad: 1.2 },
]
/** La actividad tal como la deja hoy `convertir_partida_a_plan`. */
const ACTIVIDAD_COMPLETA = {
  id: 'a-1', tipo: 'tarea', rol_estructura: null, nombre: 'VIGA DE ENCADENADO H17',
  tarea_tipo_id: 'tt-1', unidad: 'm3', cantidad_objetivo: 2.08, hh_plan: 71.34,
  dotacion_prevista: 3, fin_plan: '2026-09-10', cotizacion_partida_id: 'p-1',
  partida_codigo: 'E-01', fuente: 'conversion_presupuesto',
}
const RUBRO = { id: 'r-1', tipo: 'resumen', rol_estructura: 'rubro', nombre: 'ESTRUCTURA', cotizacion_partida_id: 'p-1', fuente: 'conversion_presupuesto' }
const PLAN_FISICO = COMPOSICION.map((l) => ({ ...l, cantidad_plan: l.cantidad * 2.08 }))

const busca = (a, clave) => a.controles.find((c) => c.concepto === clave)

// ═══ (N) EL PUENTE CONSERVA EL TIPO DE TAREA Y EL PLAN ═══
//
// El defecto que atrapa: que una actividad nazca huérfana. Si alguien borra el `tarea_tipo_id` del
// insert de la conversión, o el plan de materiales deja de sembrarse, este test se pone rojo — que
// es exactamente lo que NO pasaba antes: se convertían 26 actividades sin un solo material y los
// 9.000 tests seguían verdes.

test('(N) presupuesto → obra conserva tarea_tipo_id y todo el plan cuando la conversión hace su trabajo', () => {
  const a = auditarPartida({
    partida: PARTIDA, actividades: [RUBRO, ACTIVIDAD_COMPLETA], composicion: COMPOSICION,
    insumosPlan: PLAN_FISICO, cuadrillaTipo: 3, dependencias: [], pasosDePlantilla: 0,
  })
  assert.equal(busca(a, 'tarea_tipo').estado, VEREDICTO.CONSERVADO)
  assert.equal(busca(a, 'materiales').estado, VEREDICTO.CONSERVADO)
  assert.equal(busca(a, 'equipos').estado, VEREDICTO.CONSERVADO)
  assert.equal(busca(a, 'hh_plan').estado, VEREDICTO.CONSERVADO)
  assert.equal(busca(a, 'rendimiento').estado, VEREDICTO.CONSERVADO)
  assert.equal(busca(a, 'duracion').estado, VEREDICTO.CONSERVADO)
  assert.equal(busca(a, 'fuente').estado, VEREDICTO.CONSERVADO)
  assert.deepEqual(a.perdidos, [])
})

test('(N) una actividad SIN tarea_tipo cuando la partida lo tenía se denuncia como PERDIDO', () => {
  const huerfana = { ...ACTIVIDAD_COMPLETA, tarea_tipo_id: null }
  const a = auditarPartida({ partida: PARTIDA, actividades: [RUBRO, huerfana], composicion: COMPOSICION, insumosPlan: PLAN_FISICO, cuadrillaTipo: 3 })
  assert.equal(busca(a, 'tarea_tipo').estado, VEREDICTO.PERDIDO)
  assert.match(busca(a, 'tarea_tipo').rompe, /no aporta ni consume experiencia/)
  assert.ok(a.perdidos.includes('tarea_tipo'))
})

test('(N) la composición congelada que no llega a la obra es una PÉRDIDA, no un dato ausente', () => {
  // Éste es el estado que tenía la base antes de la 1800: 462 líneas congeladas, 0 en la obra.
  const a = auditarPartida({ partida: PARTIDA, actividades: [RUBRO, ACTIVIDAD_COMPLETA], composicion: COMPOSICION, insumosPlan: [], cuadrillaTipo: 3 })
  assert.equal(busca(a, 'materiales').estado, VEREDICTO.PERDIDO)
  assert.equal(busca(a, 'equipos').estado, VEREDICTO.PERDIDO)
  assert.match(busca(a, 'materiales').detalle, /2 materiales congelados/)
  assert.deepEqual(busca(a, 'materiales').evidencia, { congelados: 2, en_obra: 0 })
})

// ═══ LA DISTINCIÓN QUE HACE ÚTIL AL AUDITOR ═══

test('(N) sin cuadrilla tipo en el análisis, la dotación ausente NO es culpa del puente', () => {
  // `analisis_cuadrilla` está vacía en la base real: el dato nunca existió. Llamarlo «perdido»
  // mandaría a alguien a corregir la conversión durante un día para nada.
  const sinDotacion = { ...ACTIVIDAD_COMPLETA, dotacion_prevista: null, fin_plan: null }
  const a = auditarPartida({ partida: PARTIDA, actividades: [RUBRO, sinDotacion], composicion: COMPOSICION, insumosPlan: PLAN_FISICO, cuadrillaTipo: null })
  assert.equal(busca(a, 'cuadrilla').estado, VEREDICTO.NO_LO_SABIA)
  assert.equal(busca(a, 'duracion').estado, VEREDICTO.NO_LO_SABIA)
  assert.match(busca(a, 'duracion').detalle, /consecuencia de la cuadrilla/)
  assert.deepEqual(a.perdidos, [])
})

test('(N) pero si el análisis SÍ declaraba cuadrilla y la actividad salió sin dotación, es PERDIDO', () => {
  const sinDotacion = { ...ACTIVIDAD_COMPLETA, dotacion_prevista: null, fin_plan: null }
  const a = auditarPartida({ partida: PARTIDA, actividades: [RUBRO, sinDotacion], composicion: COMPOSICION, insumosPlan: PLAN_FISICO, cuadrillaTipo: 3 })
  assert.equal(busca(a, 'cuadrilla').estado, VEREDICTO.PERDIDO)
  assert.equal(busca(a, 'duracion').estado, VEREDICTO.PERDIDO)
})

test('(N) una partida subcontratada sin HH no es una pérdida: es lo correcto', () => {
  const sub = { ...PARTIDA, subcontratada: true, hs_unitarias: null }
  const act = { ...ACTIVIDAD_COMPLETA, hh_plan: null }
  const a = auditarPartida({ partida: sub, actividades: [RUBRO, act], composicion: COMPOSICION, insumosPlan: PLAN_FISICO, cuadrillaTipo: 3 })
  assert.equal(busca(a, 'hh_plan').estado, VEREDICTO.NO_LO_SABIA)
  assert.match(busca(a, 'hh_plan').detalle, /subcontratada/)
})

test('(N) una plantilla con pasos encadenados que no dejó dependencias es una PÉRDIDA', () => {
  const a = auditarPartida({ partida: PARTIDA, actividades: [RUBRO, ACTIVIDAD_COMPLETA], composicion: COMPOSICION, insumosPlan: PLAN_FISICO, cuadrillaTipo: 3, pasosDePlantilla: 4, dependencias: [] })
  assert.equal(busca(a, 'dependencias').estado, VEREDICTO.PERDIDO)
})

test('(N) una actividad sin rastro de su partida no se puede auditar contra la oferta', () => {
  const anonima = { ...ACTIVIDAD_COMPLETA, cotizacion_partida_id: null, fuente: 'manual' }
  const a = auditarPartida({ partida: PARTIDA, actividades: [anonima], composicion: COMPOSICION, insumosPlan: PLAN_FISICO, cuadrillaTipo: 3 })
  assert.equal(busca(a, 'fuente').estado, VEREDICTO.PERDIDO)
})

// ═══ EL RESUMEN ═══

test('(N) el resumen no promedia: un solo concepto perdido deja el puente roto', () => {
  const buena = auditarPartida({ partida: PARTIDA, actividades: [RUBRO, ACTIVIDAD_COMPLETA], composicion: COMPOSICION, insumosPlan: PLAN_FISICO, cuadrillaTipo: 3 })
  const mala = auditarPartida({ partida: PARTIDA, actividades: [RUBRO, ACTIVIDAD_COMPLETA], composicion: COMPOSICION, insumosPlan: [], cuadrillaTipo: 3 })
  assert.equal(resumirTraspaso([buena]).puenteIntacto, true)
  const r = resumirTraspaso([buena, buena, buena, buena, buena, buena, buena, buena, buena, mala])
  assert.equal(r.puenteIntacto, false)
  assert.deepEqual(r.conceptosPerdidos.sort(), ['equipos', 'materiales'])
  assert.equal(r.partidas, 10)
})

test('los doce conceptos del traspaso están declarados y todos explican qué se rompe sin ellos', () => {
  assert.equal(CONCEPTOS.length, 12)
  for (const c of CONCEPTOS) {
    assert.ok(c.rompe && c.rompe.length > 20, `${c.clave} no dice qué se rompe si falta`)
  }
  // El resumen tiene que cubrir los doce, no una selección.
  const r = resumirTraspaso([auditarPartida({ partida: PARTIDA, actividades: [RUBRO, ACTIVIDAD_COMPLETA] })])
  assert.equal(r.porConcepto.length, 12)
})
