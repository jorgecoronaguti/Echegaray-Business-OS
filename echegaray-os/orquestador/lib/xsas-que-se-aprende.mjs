// QUÉ PUEDE ENSEÑAR CADA ACTIVIDAD, Y QUÉ LA FRENA — la ausencia con nombre.
//
// ═══ LA PREGUNTA QUE ESTE MÓDULO CONTESTA ═══
//
// No es «cuántas actividades aprenden». Es **qué falta, qué aprendizaje impide, y qué SÍ se puede
// aprender igual**. Sin esa distinción, «2 de 279 enseñan» se lee como un sistema roto; la verdad
// es otra y es accionable: sin HH imputadas no hay productividad, pero con fechas hay duración, y
// hay 116 duraciones medidas que nadie estaba mirando.
//
// ═══ LA REGLA ═══
//
// **Una ausencia nunca es un cero.** Cada métrica tiene sus propios requisitos, no se sustituyen
// entre sí, y lo que falta se nombra. El costo, además, no es un faltante que se llene cargando
// algo: no existe imputación por actividad en ninguna tabla del OS, y eso se declara como tal para
// que nadie lo confunda con un dato que alguien se olvidó de cargar.

import { num, MINIMO_APRENDIBLE } from './obra-plan-real.mjs'
import { cantidadEjecutadaDe } from './xsas-aprendizaje.mjs'

/** Las cuatro métricas del aprendizaje de obra. El orden es el de su disponibilidad real: la
 *  duración pide lo menos, el costo no se puede todavía. */
export const METRICAS = Object.freeze(['duracion', 'rendimiento', 'dotacion', 'costo'])

/** Avance mínimo para que una medición parcial signifique algo: los primeros metros de cualquier
 *  tarea incluyen el armado del frente y no representan el rendimiento de régimen. */
const avanceSuficiente = (f) => f.terminada === true || (num(f.avance_pct) ?? 0) >= MINIMO_APRENDIBLE

function puedeDuracion(f) {
  const falta = []
  if (!(num(f.plan_dias) > 0)) falta.push('duración planificada (un plan de cero días no es un plan)')
  if (num(f.dias_real) === null) falta.push('fecha real de inicio y de fin')
  if (f.terminada !== true) falta.push('el cierre de la actividad')
  return { puede: falta.length === 0, falta, porQue: 'la duración sólo necesita fechas y un plan contra el cual medirla' }
}

function puedeRendimiento(f) {
  const falta = []
  if (num(f.hh_real) === null) falta.push('horas imputadas a la actividad')
  if (cantidadEjecutadaDe(f).cantidad === null) falta.push('cantidad ejecutada, o un cierre que la implique')
  if (!avanceSuficiente(f)) falta.push(`avance de al menos ${MINIMO_APRENDIBLE}%`)
  return { puede: falta.length === 0, falta, porQue: 'el rendimiento es horas sobre cantidad: sin una de las dos no hay número' }
}

function puedeDotacion(f) {
  const falta = []
  if (!(num(f.dotacion_por_hh) > 0)) falta.push('horas imputadas por personas identificadas')
  if (!avanceSuficiente(f)) falta.push(`avance de al menos ${MINIMO_APRENDIBLE}%`)
  return {
    puede: falta.length === 0, falta,
    porQue: 'la dotación se cuenta sobre quién imputó horas — quién figuraba asignado no prueba que estuvo',
  }
}

function costoNoDisponible() {
  return {
    puede: false, noDisponible: true,
    falta: ['imputación de costo por actividad (no existe en el OS)'],
    porQue: 'costos_reales se imputa por obra: repartirlo por avance parecería un dato y no lo sería',
  }
}

/**
 * EL DIAGNÓSTICO DE UNA ACTIVIDAD, MÉTRICA POR MÉTRICA. Puro: recibe la fila de `xsas_actividad`.
 *
 * Una fila que agrupa a otras o un hito no enseña NADA, y se dice una vez para las cuatro: sus
 * fechas son la envolvente de lo que agrupa, no la duración de ninguna tarea.
 */
export function queSePuedeAprender(f = {}) {
  if (f.es_trabajo === false) {
    const bloqueo = {
      puede: false,
      falta: ['trabajo propio (la fila agrupa a otras actividades o es un hito)'],
      porQue: 'sus fechas son la envolvente de lo que agrupa, no la duración de una tarea',
    }
    return { duracion: bloqueo, rendimiento: bloqueo, dotacion: bloqueo, costo: costoNoDisponible() }
  }
  return {
    duracion: puedeDuracion(f),
    rendimiento: puedeRendimiento(f),
    dotacion: puedeDotacion(f),
    costo: costoNoDisponible(),
  }
}

/**
 * EL CUADRO DE TODA LA EMPRESA: por métrica, cuántas actividades pueden enseñar y qué frena a las
 * que no, ordenado por cuántas frena cada faltante.
 *
 * Es el número que convierte «faltan datos» en un pedido concreto: «231 actividades no enseñan
 * rendimiento porque nadie imputó horas a la actividad».
 */
export function resumirAprendizajePosible(filas = []) {
  const out = {}
  for (const m of METRICAS) out[m] = { puede: 0, noPuede: 0, noDisponible: false, frenos: new Map() }
  for (const f of filas) {
    const d = queSePuedeAprender(f)
    for (const m of METRICAS) {
      const r = d[m]
      if (r.noDisponible) out[m].noDisponible = true
      if (r.puede) { out[m].puede++; continue }
      out[m].noPuede++
      // SE CUENTA EL PRIMER FALTANTE, no todos: una actividad sin horas Y sin cantidad se cuenta una
      // sola vez, en el requisito que hay que resolver primero. Contarla en los dos inflaría el
      // total por encima de la cantidad de actividades y ningún número sería interpretable.
      const primero = r.falta[0] ?? 'sin motivo declarado'
      out[m].frenos.set(primero, (out[m].frenos.get(primero) ?? 0) + 1)
    }
  }
  return Object.fromEntries(METRICAS.map((m) => [m, {
    puede: out[m].puede,
    noPuede: out[m].noPuede,
    noDisponible: out[m].noDisponible,
    frenos: [...out[m].frenos.entries()]
      .map(([falta, actividades]) => ({ falta, actividades }))
      .sort((a, b) => b.actividades - a.actividades),
  }]))
}
