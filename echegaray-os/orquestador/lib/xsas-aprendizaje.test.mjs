import test from 'node:test'
import assert from 'node:assert/strict'
import { analizarFila, diasEntre, aprender, OBRAS_NO_REALES } from './xsas-aprendizaje.mjs'

// Una fila como la devuelve `public.xsas_actividad`, con los tipos que devuelve Postgres: los
// numéricos vienen como STRING y ése es el modo de falla que más veces rompió este repo.
const fila = (x = {}) => ({
  actividad_id: 'a1', obra_id: 'quattropani', obra: 'Salón Comercial', cliente: 'Q',
  actividad: 'REPLANTEO', tarea: 'REPLANTEO', tarea_tipo_id: 't1', unidad: 'm2',
  plan_cantidad: '258.77', plan_hh: '31.0524', plan_dias: null, plan_dotacion: null,
  cantidad_real: '258.77', hh_real: '30.00', hh_improductivas: '0',
  avance_medido: null, avance_declarado: null, personas_con_hh: 1, dotacion_real: 0,
  presupuesto_hs_unitarias: '0.12', partes: 1, con_evidencia: 1,
  primera_hh: '2026-08-01', ultima_hh: '2026-08-05', ultima_ejecucion: '2026-08-05',
  dias_real: null, ...x,
})

test('los numéricos que Postgres devuelve como texto se calculan igual', () => {
  const o = analizarFila(fila())
  assert.equal(o.plan.hsUnitarias.toFixed(4), '0.1200')
  assert.equal(o.real.hsUnitarias.toFixed(4), '0.1159')
  assert.equal(Math.round(o.avancePct), 100)
  assert.equal(o.aprendible, true)
})

test('el costo por actividad no existe y se declara: no se rellena con cero', () => {
  const o = analizarFila(fila())
  assert.equal(o.real.costo, null)
  assert.equal(o.derivado.desvioCostoPct, null)
  assert.ok(o.faltantes.some((f) => f.includes('costo')))
})

test('la duración real sale de las HH cuando la actividad no la declara', () => {
  assert.equal(analizarFila(fila()).real.dias, 5)
  assert.equal(analizarFila(fila({ dias_real: '3' })).real.dias, 3, 'lo declarado le gana a lo deducido')
  assert.equal(diasEntre(null, '2026-08-05'), null)
  assert.equal(diasEntre('2026-08-01', '2026-08-01'), 1)
})

test('la dotación real son las personas que imputaron horas, no las asignadas', () => {
  // Quién estuvo, no quién figuraba.
  assert.equal(analizarFila(fila({ personas_con_hh: 3, dotacion_real: 7 })).real.dotacion, 3)
  assert.equal(analizarFila(fila({ personas_con_hh: 0, dotacion_real: 7 })).real.dotacion, 7)
})

test('sin plan de obra, el rendimiento con el que se comparó es el del presupuesto', () => {
  const o = analizarFila(fila({ plan_hh: null }))
  assert.equal(o.plan.hsUnitarias, null)
  assert.equal(o.hsUnitariasPlan, 0.12, 'la partida cotizada es el plan que quedó')
})

test('la obra de pruebas no puede enseñarle nada al OS', async () => {
  // Un fixture que entrena el sistema es peor que no tener datos.
  const vistas = []
  const query = async (sql, params) => {
    vistas.push({ sql, params })
    return { rows: [] }
  }
  const r = await aprender({ query }, { dry: true })
  assert.equal(r.aprendidas, 0)
  assert.deepEqual(vistas[0].params, [OBRAS_NO_REALES])
  assert.match(vistas[0].sql, /obra_id <> all/)
})

test('sin tipo de tarea el rendimiento no se guarda, y el hueco se cuenta', async () => {
  const query = async (sql) => {
    if (/from public\.xsas_actividad/.test(sql)) return { rows: [fila({ tarea_tipo_id: null })] }
    return { rows: [] }
  }
  const r = await aprender({ query }, { dry: true })
  assert.equal(r.aprendidas, 0, 'no se puede reutilizar en otra obra un rendimiento sin tarea')
  assert.equal(r.sinTipoDeTarea, 1, 'pero el hueco se ve')
})
