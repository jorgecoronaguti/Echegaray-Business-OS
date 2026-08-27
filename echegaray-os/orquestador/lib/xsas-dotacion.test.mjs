// LA TERCERA MÉTRICA — cuánta gente, con las mismas guardas que las otras dos.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aprenderDotacion, dotacionesConsistentes, desvioDotacion, confianzaDotacion,
} from './xsas-dotacion.mjs'

const fila = (o, extra = {}) => ({
  actividad_id: `act-${o}`, obra_id: o, actividad: 'Encofrado', tarea_tipo_id: 't1',
  plan_dotacion: 4, dotacion_por_hh: 4, avance_pct: 100, terminada: true, avance_sumado: false,
  dias_real: 5, inicio_real: '2026-07-01', fin_real: '2026-07-05', ...extra,
})

/** Una base falsa que devuelve `filas` para la vista y nada para el resto. */
function base(filas, previos = []) {
  return {
    query: async (sql) => {
      if (/count\(\*\)::int n from public\.xsas_actividad/.test(sql)) return { rows: [{ n: 7 }] }
      if (/from public\.xsas_actividad/.test(sql)) return { rows: filas }
      if (/from public\.dotacion_historica/.test(sql)) return { rows: previos }
      return { rows: [] }
    },
  }
}

test('una persona de diferencia sigue siendo la misma cuadrilla; cuatro no', () => {
  // Con cuadrillas chicas el porcentaje solo no sirve: 2 contra 3 es 50% y es la misma cuadrilla
  // con un ayudante más.
  assert.equal(dotacionesConsistentes(2, 3), true)
  assert.equal(dotacionesConsistentes(10, 11), true)
  assert.equal(dotacionesConsistentes(10, 14), false)
  assert.equal(dotacionesConsistentes(null, 3), false, 'sin dato no se confirma nada')
})

test('el desvío sólo existe si hubo plan; sin plan es null, nunca cero', () => {
  assert.equal(desvioDotacion(4, 5), 25)
  assert.equal(desvioDotacion(null, 5), null)
  assert.equal(desvioDotacion(0, 5), null)
})

test('una actividad que recién arranca no enseña una dotación de régimen', () => {
  assert.equal(confianzaDotacion({ terminada: false, avancePct: 10 }), 'baja')
  assert.equal(confianzaDotacion({ terminada: false, avancePct: 60 }), 'media')
  assert.equal(confianzaDotacion({ terminada: true, avanceSumado: false }), 'alta')
  // Un cierre armado sumando dos declaraciones no vale como cierre medido.
  assert.equal(confianzaDotacion({ terminada: true, avanceSumado: true }), 'media')
})

test('valida con OTRA obra, no con otro frente de la misma', async () => {
  // Dos frentes de la misma obra comparten cuadrilla: que coincidan no prueba nada sobre la tarea.
  const mismaObra = await aprenderDotacion(base([fila('sf'), fila('sf', { actividad_id: 'act-sf2' })]), { dry: true })
  assert.equal(mismaObra.validadas, 0)

  const dosObras = await aprenderDotacion(base([fila('sf'), fila('me')]), { dry: true })
  assert.equal(dosObras.validadas, 1, 'la segunda confirma a la primera en la MISMA corrida')
})

test('el estado sale de la evidencia, no de cuántas veces se corrió el ciclo', async () => {
  // El defecto que ya pagaron rendimiento y duración: `previos` cargado antes del bucle y no
  // actualizado hacía que el estado dependiera del reloj. Acá se prueba con la tabla vacía.
  const r = await aprenderDotacion(base([fila('a'), fila('b'), fila('c')], []), { dry: true })
  assert.equal(r.medidas, 3)
  assert.equal(r.validadas, 2)
})

test('el hueco se cuenta: sin horas imputadas no hay dotación, y eso no es cero personas', async () => {
  const r = await aprenderDotacion(base([fila('sf')]), { dry: true })
  assert.equal(r.sinHorasImputadas, 7)
  assert.equal(r.conPlan, 1)
})

test('sin tipo de tarea el hecho se guarda igual, pero nunca VALIDA', async () => {
  const sinTipo = [fila('sf', { tarea_tipo_id: null }), fila('me', { tarea_tipo_id: null })]
  const r = await aprenderDotacion(base(sinTipo), { dry: true })
  assert.equal(r.medidas, 2)
  assert.equal(r.sinTipo, 2)
  assert.equal(r.validadas, 0, 'sin tipo no se puede comparar entre obras')
})

test('en ensayo no escribe', async () => {
  let escribio = false
  const b = {
    query: async (sql) => {
      if (/^\s*insert/i.test(sql)) escribio = true
      if (/count\(\*\)::int n from public\.xsas_actividad/.test(sql)) return { rows: [{ n: 0 }] }
      if (/from public\.xsas_actividad/.test(sql)) return { rows: [fila('sf')] }
      return { rows: [] }
    },
  }
  await aprenderDotacion(b, { dry: true })
  assert.equal(escribio, false)
})
