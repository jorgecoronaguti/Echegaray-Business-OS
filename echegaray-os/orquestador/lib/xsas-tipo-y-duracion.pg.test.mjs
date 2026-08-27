// LOS DOS DEFECTOS QUE LA AUDITORÍA ENCONTRÓ, CON UNA PRUEBA CADA UNO.
//
// Ninguno de los dos rompía un test: el trigger no tenía ni uno, y la duración se probaba siempre
// con un `previos` fabricado, nunca con el estado que la propia función escribe.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'
import { aprenderDuracion } from './xsas-aprendizaje.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('cambiar el tipo de tarea NO deja la evidencia del tipo anterior', { skip: !hayBase }, async () => {
  // El defecto: la actividad pasaba a decir que es EXCAVACIONES con la evidencia de que su nombre
  // coincide exactamente con REPLANTEO, y confianza EXACTO. Y hay un camino de la web que lo
  // dispara: `vinculacionEstandar.ts` re-vincula una actividad ya clasificada.
  const c = await getPool().connect()
  try {
    await c.query('begin')
    const { rows: [t1] } = await c.query(`select id from tarea_tipo where activo is not false limit 1`)
    const { rows: [t2] } = await c.query(`select id from tarea_tipo where activo is not false and id <> $1 limit 1`, [t1.id])
    const { rows: [a] } = await c.query(
      `select id from obra_actividad where tarea_tipo_id = $1 and archivada is not true limit 1`, [t1.id])
    if (!a) return // sin una actividad clasificada de ese tipo no hay nada que medir acá

    await c.query(`update obra_actividad set tarea_tipo_evidencia = $2, tarea_tipo_origen = 'nombre-exacto',
                     tarea_tipo_confianza = 'EXACTO' where id = $1`,
    [a.id, JSON.stringify({ por_que: 'el nombre coincide exactamente con «REPLANTEO»' })])
    // `analisis_id` se limpia primero: una guarda anterior impide que el análisis apunte a una tarea
    // y la actividad a otra. No es lo que se está midiendo acá.
    await c.query(`update obra_actividad set analisis_id = null, tarea_tipo_id = $2 where id = $1`, [a.id, t2.id])

    const { rows: [d] } = await c.query(
      `select tarea_tipo_id, tarea_tipo_origen, tarea_tipo_evidencia from obra_actividad where id = $1`, [a.id])
    assert.equal(d.tarea_tipo_id, t2.id)
    assert.equal(d.tarea_tipo_evidencia, null, 'la evidencia del tipo anterior sobrevivió al cambio')
    // El origen se RECALCULA según de dónde viene el vínculo nuevo (presupuesto si la actividad
    // cuelga de una partida cotizada, plantilla si tiene análisis, manual si no). Lo que no puede
    // quedar es el rótulo del vínculo anterior.
    assert.notEqual(d.tarea_tipo_origen, 'nombre-exacto', 'el origen siguió describiendo el vínculo viejo')
    assert.ok(['presupuesto', 'plantilla', 'manual'].includes(d.tarea_tipo_origen))
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})

test('el estado de la duración sale de la evidencia, no de cuántas veces se corrió el ciclo', { skip: !hayBase }, async () => {
  // El defecto: `previos` se cargaba antes del bucle y no se actualizaba, así que tres actividades
  // del mismo tipo en tres obras distintas daban CANDIDATO en la primera corrida y VALIDADO en la
  // segunda, con los mismos hechos. Y vaciar la tabla borraba los VALIDADO sin que cambiara un dato.
  const filas = ['obra-a', 'obra-b', 'obra-c'].map((o, i) => ({
    actividad_id: `act-${i}`, obra_id: o, actividad: 'X', tarea_tipo_id: 't1',
    plan_dias: '5', dias_real: '5', terminada: true, avance_sumado: false, dotacion_real: 1,
    inicio_plan: '2026-07-01', fin_plan: '2026-07-05', inicio_real: '2026-07-01', fin_real: '2026-07-05',
  }))
  const query = async (sql) => {
    if (/from public\.xsas_actividad/.test(sql)) return /count\(\*\)/.test(sql) ? { rows: [{ n: 0 }] } : { rows: filas }
    if (/from public\.duracion_historica/.test(sql)) return { rows: [] }   // la tabla arranca vacía
    return { rows: [] }
  }
  const r = await aprenderDuracion({ query }, { dry: true })
  assert.equal(r.medidas, 3)
  assert.equal(r.validadas, 2, 'la segunda y la tercera confirman a la primera en la MISMA corrida')
})
