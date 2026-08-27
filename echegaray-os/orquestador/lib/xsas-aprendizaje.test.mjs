import test from 'node:test'
import assert from 'node:assert/strict'
import { analizarFila, cantidadEjecutadaDe, diasEntre, aprender, OBRAS_NO_REALES } from './xsas-aprendizaje.mjs'

// Una fila como la devuelve `public.xsas_actividad`, que ahora LEE de `obra_actividad_control`. Los
// numéricos vienen como STRING desde Postgres: es el modo de falla que más veces rompió este repo.
const fila = (x = {}) => ({
  actividad_id: 'a1', obra_id: 'quattropani', obra: 'Salón Comercial', cliente: 'Q',
  actividad: 'REPLANTEO', tarea: 'REPLANTEO', tarea_tipo_id: 't1', unidad: 'm2',
  plan_cantidad: '258.77', plan_hh: '31.0524', plan_dias: null, plan_dotacion: null,
  cantidad_real: '258.77', avance_pct: '100', origen_avance: 'cantidad', terminada: true,
  hh_real: '30.00', hh_improductivas: '0', hh_productivas: '30.00', n_imputaciones: 1,
  dotacion_real: 1, presupuesto_hs_unitarias: '0.12', n_partes: 1,
  inicio_real: '2026-08-19', fin_real: '2026-08-22', dias_real: 4,
  origen_inicio_real: 'imputación de HH', origen_fin_real: 'parte de avance',
  ultimo_parte: '2026-08-22', ...x,
})

test('los numéricos que Postgres devuelve como texto se calculan igual', () => {
  const o = analizarFila(fila())
  assert.equal(o.plan.hsUnitarias.toFixed(4), '0.1200')
  assert.equal(o.real.hsUnitarias.toFixed(4), '0.1159')
  assert.equal(o.avancePct, 100)
  assert.equal(o.aprendible, true)
})

test('el avance y las fechas se LEEN de la vista, no se recalculan acá', () => {
  // El día que este módulo volvió a decidirlo por su cuenta publicó «ninguna actividad tiene fecha
  // real» mientras el sistema tenía 152.
  const o = analizarFila(fila({ avance_pct: '43', terminada: false, fin_real: null }))
  assert.equal(o.avancePct, 43)
  assert.equal(o.inicioReal, '2026-08-19')
  assert.equal(o.finReal, null)
  assert.equal(o.origenInicioReal, 'imputación de HH')
})

test('terminada manda sobre el porcentaje para la confianza', () => {
  assert.equal(analizarFila(fila({ avance_pct: '96', terminada: false })).confianza, 'media')
  assert.equal(analizarFila(fila({ avance_pct: '100', terminada: true })).confianza, 'alta')
})

test('una actividad parcial NO aprende como terminada', () => {
  const o = analizarFila(fila({ avance_pct: '43', terminada: false, fin_real: null, cantidad_real: '20', hh_real: '10' }))
  assert.equal(o.confianza, 'baja')
  assert.equal(o.terminada, false)
  assert.equal(o.finReal, null)
})

// ── LA CANTIDAD QUE SE PUEDE DEMOSTRAR ───────────────────────────────────────────────────────

test('terminada sin cantidad cargada: lo ejecutado es el objetivo, y queda marcado como derivado', () => {
  const r = cantidadEjecutadaDe({ cantidad_real: null, plan_cantidad: '120', terminada: true })
  assert.equal(r.cantidad, 120)
  assert.equal(r.derivada, true)
  assert.match(r.porQue, /terminada/)
})

test('un 60% de avance NO son 60% de los metros: eso sería inventar la medición', () => {
  const r = cantidadEjecutadaDe({ cantidad_real: null, plan_cantidad: '120', terminada: false, avance_pct: '60' })
  assert.equal(r.cantidad, null)
  assert.equal(r.derivada, false)
})

test('la cantidad cargada le gana siempre a la derivada', () => {
  const r = cantidadEjecutadaDe({ cantidad_real: '95', plan_cantidad: '120', terminada: true })
  assert.equal(r.cantidad, 95)
  assert.equal(r.derivada, false)
})

test('la derivación viaja en la evidencia, no escondida en el número', async () => {
  const escrituras = []
  const query = async (sql, params) => {
    if (/from public\.xsas_actividad/.test(sql)) {
      return { rows: [fila({ cantidad_real: null, plan_cantidad: '10', plan_hh: '20', hh_real: '18', terminada: true, avance_pct: '100' })] }
    }
    escrituras.push({ sql, params })
    return { rows: [] }
  }
  const r = await aprender({ query })
  const ev = JSON.parse(escrituras.find((e) => /insert into public.rendimiento_historico/.test(e.sql)).params.find((p) => typeof p === 'string' && p.startsWith('{')))
  assert.equal(ev.cantidad_derivada, true)
  assert.match(ev.cantidad_derivada_porque, /terminada/)
  assert.equal(r.aprendidas, 1)
})

// ── LO QUE NO SE PUEDE DEMOSTRAR QUEDA EN NULL ───────────────────────────────────────────────

test('el costo por actividad no existe y se declara: no se rellena con cero', () => {
  const o = analizarFila(fila())
  assert.equal(o.real.costo, null)
  assert.equal(o.derivado.desvioCostoPct, null)
  assert.ok(o.faltantes.some((f) => f.includes('costo')))
})

test('HH faltantes no se convierten en cero', () => {
  const o = analizarFila(fila({ hh_real: null, hh_improductivas: null }))
  assert.equal(o.real.hh, null)
  assert.equal(o.real.hsUnitarias, null)
  assert.equal(o.aprendible, false)
  assert.ok(o.faltantes.includes('HH reales imputadas a la actividad'))
})

test('la duración real sale de las fechas derivadas', () => {
  assert.equal(analizarFila(fila()).real.dias, 4)
  assert.equal(analizarFila(fila({ dias_real: null })).real.dias, null)
  assert.equal(diasEntre('2026-08-01', '2026-08-01'), 1)
  assert.equal(diasEntre(null, '2026-08-05'), null)
})

test('la obra de pruebas no puede enseñarle nada al OS', async () => {
  const vistas = []
  const query = async (sql, params) => { vistas.push({ sql, params }); return { rows: [] } }
  const r = await aprender({ query }, { dry: true })
  assert.equal(r.aprendidas, 0)
  assert.deepEqual(vistas[0].params, [OBRAS_NO_REALES, null], 'la obra de fixture se excluye siempre; el filtro de obras va en null en producción')
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

test('un parte duplicado no duplica el rendimiento: la clave es la actividad', async () => {
  const escrituras = []
  const query = async (sql, params) => {
    if (/from public\.xsas_actividad/.test(sql)) return { rows: [fila(), fila()] }
    escrituras.push({ sql, params }); return { rows: [] }
  }
  await aprender({ query })
  const ins = escrituras.filter((e) => /insert into public\.rendimiento_historico/.test(e.sql))
  assert.equal(ins.length, 2, 'se intenta escribir las dos')
  assert.match(ins[0].sql, /on conflict \(actividad_id\)/, 'y la base deja una sola')
  assert.equal(ins[0].params.at(-1), ins[1].params.at(-1), 'misma clave')
})
