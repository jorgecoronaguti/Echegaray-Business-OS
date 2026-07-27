import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularError, medirPrediccion, cuadroPrecision, detectarSesgo,
  proponerAjustes, evaluarAjuste, separarCajaNegra, registrarPropuestaAjuste,
  diasDeHorizonte, METRICAS_CAJA,
} from './aprendizaje-forecast.mjs'

const realesMap = (obj) => new Map(Object.entries(obj))

// ─── calcularError: convención de signo y el real cero ───────────────────────

test('error = predicho − real: positivo = SOBREESTIMA', () => {
  const e = calcularError(1200000, 1000000)
  assert.equal(e.error, 200000)
  assert.equal(e.error_abs, 200000)
  assert.equal(e.error_pct, 0.2)
})

test('subestimar da error negativo, y el % usa el |real|', () => {
  const e = calcularError(800000, 1000000)
  assert.equal(e.error, -200000)
  assert.equal(e.error_pct, -0.2)
})

test('real = 0 no es "0% de error": el porcentaje queda null (no medible por %), el abs sí existe', () => {
  const e = calcularError(500000, 0)
  assert.equal(e.error, 500000)
  assert.equal(e.error_pct, null)
})

test('sin predicho o sin real, no se inventa un error: todo null', () => {
  assert.deepEqual(calcularError(null, 1000), { error: null, error_abs: null, error_pct: null })
  assert.deepEqual(calcularError(1000, undefined), { error: null, error_abs: null, error_pct: null })
})

// ─── medirPrediccion: el caso "sin real todavía" es sagrado ───────────────────

test('predicción con real observado → medido, con su error', () => {
  const m = medirPrediccion({ metrica: 'saldo_final_proyectado', horizonte: null, fecha_objetivo: '2026-07-20', valor: 900000 }, realesMap({ '2026-07-20': 1000000 }), '2026-07-27')
  assert.equal(m.estado, 'medido')
  assert.equal(m.real, 1000000)
  assert.equal(m.error, -100000)
})

test('día objetivo en el FUTURO → aun_no_medible, jamás un error falso', () => {
  const m = medirPrediccion({ metrica: 'saldo_final_proyectado', fecha_objetivo: '2026-08-15', valor: 900000 }, new Map(), '2026-07-27')
  assert.equal(m.estado, 'aun_no_medible')
  assert.equal(m.error, null)
  assert.equal(m.real, null)
})

test('día ya pasado pero sin caja real capturada → sin_real (hueco de dato, no error)', () => {
  const m = medirPrediccion({ metrica: 'saldo_final_proyectado', fecha_objetivo: '2026-07-10', valor: 900000 }, new Map(), '2026-07-27')
  assert.equal(m.estado, 'sin_real')
  assert.equal(m.error, null)
})

test('predicción sin fecha objetivo resoluble → sin_fecha, no se le inventa un día', () => {
  const m = medirPrediccion({ metrica: 'saldo_final_proyectado', fecha_objetivo: null, valor: 900000 }, new Map(), '2026-07-27')
  assert.equal(m.estado, 'sin_fecha')
})

// ─── cuadroPrecision: error medio (sesgo) y MAPE por métrica/horizonte ────────

test('el cuadro agrupa por métrica/horizonte y separa medidas de pendientes', () => {
  const preds = [
    { metrica: 'proyeccion_7dias', horizonte: 'dias_7', fecha_objetivo: '2026-07-20', valor: 1100000 },
    { metrica: 'proyeccion_7dias', horizonte: 'dias_7', fecha_objetivo: '2026-07-21', valor: 1050000 },
    { metrica: 'proyeccion_7dias', horizonte: 'dias_7', fecha_objetivo: '2026-08-30', valor: 999 }, // futuro
  ]
  const reales = realesMap({ '2026-07-20': 1000000, '2026-07-21': 1000000 })
  const c = cuadroPrecision(preds, reales, '2026-07-27')
  assert.equal(c.total_predicciones, 3)
  assert.equal(c.total_medidas, 2)
  assert.equal(c.total_pendientes, 1)
  const g = c.por_metrica_horizonte.find((x) => x.metrica === 'proyeccion_7dias')
  assert.equal(g.n_medido, 2)
  assert.equal(g.n_aun_no_medible, 1)
  // errores: +100000 y +50000 → sesgo medio +75000, MAE 75000, MAPE (0.1+0.05)/2 = 0.075
  assert.equal(g.error_medio, 75000)
  assert.equal(g.mae, 75000)
  assert.equal(g.mape, 0.075)
})

test('un cuadro sin ninguna medida es honesto: 0 medidas, nada de MAPE inventado', () => {
  const preds = [{ metrica: 'saldo_final_proyectado', horizonte: null, fecha_objetivo: '2026-09-01', valor: 500000 }]
  const c = cuadroPrecision(preds, new Map(), '2026-07-27')
  assert.equal(c.total_medidas, 0)
  assert.equal(c.por_metrica_horizonte[0].error_medio, null)
  assert.equal(c.por_metrica_horizonte[0].mape, null)
})

// ─── detectarSesgo: sistemático sólo con evidencia suficiente ─────────────────

test('sesgo sistemático: todos los errores del mismo signo y n suficiente', () => {
  const s = detectarSesgo([{ error: 100 }, { error: 200 }, { error: 150 }, { error: 90 }])
  assert.equal(s.sistematico, true)
  assert.equal(s.direccion, 'sobreestima')
})

test('n chico NO es patrón: no se concluye sesgo con menos de 3 mediciones', () => {
  const s = detectarSesgo([{ error: 100 }, { error: 200 }])
  assert.equal(s.sistematico, false)
  assert.equal(s.motivo, 'pocas mediciones')
})

test('signos mezclados NO son sesgo sistemático', () => {
  const s = detectarSesgo([{ error: 100 }, { error: -200 }, { error: 150 }, { error: -90 }])
  assert.equal(s.sistematico, false)
})

// ─── proponerAjustes: PROPONE, no aplica (gobernanza) ─────────────────────────

test('ante sesgo sistemático propone un ajuste — SIEMPRE aplicar:false y requiere confirmación', () => {
  const preds = ['2026-07-18', '2026-07-19', '2026-07-20', '2026-07-21'].map((f) => ({
    metrica: 'saldo_final_proyectado', horizonte: null, fecha_objetivo: f, valor: 1200000,
  }))
  const reales = realesMap({ '2026-07-18': 1000000, '2026-07-19': 1000000, '2026-07-20': 1000000, '2026-07-21': 1000000 })
  const c = cuadroPrecision(preds, reales, '2026-07-27')
  const props = proponerAjustes(c)
  assert.equal(props.length, 1)
  const p = props[0]
  assert.equal(p.estado, 'propuesta')
  assert.equal(p.aplicar, false)
  assert.equal(p.requiere_confirmacion_dueno, true)
  assert.match(p.diagnostico, /sobreestima/)
  assert.ok(p.factor_correccion_sugerido < 1) // sobreestima → escalar hacia abajo
})

test('sin sesgo sistemático no hay propuesta: el motor no molesta al dueño con ruido', () => {
  const preds = [
    { metrica: 'saldo_final_proyectado', horizonte: null, fecha_objetivo: '2026-07-18', valor: 1100000 },
    { metrica: 'saldo_final_proyectado', horizonte: null, fecha_objetivo: '2026-07-19', valor: 900000 },
    { metrica: 'saldo_final_proyectado', horizonte: null, fecha_objetivo: '2026-07-20', valor: 1050000 },
  ]
  const reales = realesMap({ '2026-07-18': 1000000, '2026-07-19': 1000000, '2026-07-20': 1000000 })
  assert.equal(proponerAjustes(cuadroPrecision(preds, reales, '2026-07-27')).length, 0)
})

test('sólo propone sobre métricas de plata (soloCaja por defecto)', () => {
  const c = { por_metrica_horizonte: [{ metrica: 'algo_no_caja', horizonte: null, n_medido: 5, mape: 0.3, error_medio: 100, mae: 100, sesgo: { sistematico: true, direccion: 'sobreestima' } }] }
  assert.equal(proponerAjustes(c).length, 0)
  assert.ok(METRICAS_CAJA.length > 0)
})

// ─── evaluarAjuste: para poder revertir lo que no sirve ───────────────────────

test('un ajuste que baja el MAPE se marca como mejora → mantener', () => {
  const r = evaluarAjuste({ antes: { mape: 0.20 }, despues: { mape: 0.12 } })
  assert.equal(r.mejoro, true)
  assert.equal(r.veredicto, 'mejoro')
  assert.equal(r.base, 'mape')
})

test('un ajuste que EMPEORA la precisión se marca para REVERTIR', () => {
  const r = evaluarAjuste({ antes: { mape: 0.12 }, despues: { mape: 0.25 } })
  assert.equal(r.mejoro, false)
  assert.equal(r.veredicto, 'empeoro')
  assert.match(r.recomendacion, /REVERTIR/)
})

test('sin MAPE, evaluarAjuste cae a MAE; sin ninguno, dice que no es medible', () => {
  assert.equal(evaluarAjuste({ antes: { mae: 100 }, despues: { mae: 80 } }).base, 'mae')
  assert.equal(evaluarAjuste({ antes: {}, despues: {} }).medible, false)
})

// ─── diasDeHorizonte ──────────────────────────────────────────────────────────

test('diasDeHorizonte parsea dias_N y rechaza lo demás sin inventar', () => {
  assert.equal(diasDeHorizonte('dias_7'), 7)
  assert.equal(diasDeHorizonte('dias_30'), 30)
  assert.equal(diasDeHorizonte('mes'), null)
  assert.equal(diasDeHorizonte(null), null)
})

// ─── separarCajaNegra: predicciones vs. anclas de real, sin recalcular ────────

test('caja_hoy y caja_inicial se vuelven ANCLAS de real por su día; los saldos proyectados, predicciones', () => {
  const filas = [
    { fuente: 'modelo', metrica: 'caja_hoy', horizonte: null, fecha_objetivo: null, valor: 1000000, estado: 'ok', calculado_en: '2026-07-20T09:00:00Z' },
    { fuente: 'calendario', metrica: 'caja_inicial', horizonte: null, fecha_objetivo: '2026-07-21', valor: 1050000, estado: 'ok', calculado_en: '2026-07-21T09:00:00Z' },
    { fuente: 'calendario', metrica: 'saldo_final_proyectado', horizonte: null, fecha_objetivo: '2026-07-25', valor: 800000, estado: 'ok', calculado_en: '2026-07-20T09:00:00Z' },
    { fuente: 'modelo', metrica: 'proyeccion_7dias', horizonte: 'dias_7', fecha_objetivo: null, valor: 1200000, estado: 'ok', calculado_en: '2026-07-20T09:00:00Z' },
  ]
  const { predicciones, realesPorFecha } = separarCajaNegra(filas)
  assert.equal(realesPorFecha.get('2026-07-20'), 1000000) // caja_hoy anclada por el día del cálculo
  assert.equal(realesPorFecha.get('2026-07-21'), 1050000) // caja_inicial anclada por su fecha_objetivo
  assert.equal(predicciones.length, 2)
  // proyeccion_7dias sin fecha_objetivo se resuelve como calculado_en + 7 días
  const proy = predicciones.find((p) => p.metrica === 'proyeccion_7dias')
  assert.equal(proy.fecha_objetivo, '2026-07-27')
})

test('separarCajaNegra ignora filas sin_dato y valores null: no entran como 0', () => {
  const filas = [
    { fuente: 'calendario', metrica: 'saldo_final_proyectado', horizonte: null, fecha_objetivo: '2026-07-25', valor: null, estado: 'sin_dato', calculado_en: '2026-07-20T09:00:00Z' },
    { fuente: 'modelo', metrica: 'caja_hoy', horizonte: null, fecha_objetivo: null, valor: null, estado: 'ok', calculado_en: '2026-07-20T09:00:00Z' },
  ]
  const { predicciones, realesPorFecha } = separarCajaNegra(filas)
  assert.equal(predicciones.length, 0)
  assert.equal(realesPorFecha.size, 0)
})

// ─── registrarPropuestaAjuste: gobernanza en el borde ─────────────────────────

function fakeBacklog() {
  const rows = []
  return {
    rows,
    query: async (sql, params) => {
      // Emula el INSERT ... WHERE NOT EXISTS (titulo abierto) ... RETURNING id
      const titulo = params[1]
      const yaAbierta = rows.some((r) => r.titulo === titulo && ['abierto', 'en_curso'].includes(r.estado))
      if (yaAbierta) return { rows: [] }
      const row = { id: `bk-${rows.length + 1}`, titulo, estado: 'abierto', nivel: params[9], tipo: params[0] }
      rows.push(row)
      return { rows: [{ id: row.id }] }
    },
  }
}

const propuestaValida = {
  tipo: 'ajuste_supuesto', metrica: 'saldo_final_proyectado', horizonte: 'dias_7',
  diagnostico: 'sobreestima sistemáticamente', factor_correccion_sugerido: 0.9,
  estado: 'propuesta', aplicar: false, requiere_confirmacion_dueno: true, nota: 'decisión del dueño',
}

test('registrarPropuestaAjuste deja la propuesta en el backlog con autonomía E (decisión del dueño)', async () => {
  const db = fakeBacklog()
  const r = await registrarPropuestaAjuste(db, propuestaValida)
  assert.equal(r.registrada, true)
  assert.equal(db.rows[0].nivel, 'E') // mueve plata → requiere humano, nunca autónomo
  assert.equal(db.rows[0].tipo, 'mejora_potencial')
})

test('no duplica una propuesta ya abierta (idempotente por título)', async () => {
  const db = fakeBacklog()
  await registrarPropuestaAjuste(db, propuestaValida)
  const r2 = await registrarPropuestaAjuste(db, propuestaValida)
  assert.equal(r2.registrada, false)
  assert.equal(db.rows.length, 1)
})

test('GOBERNANZA: registrar RECHAZA cualquier cosa que pretenda aplicarse sola', async () => {
  const db = fakeBacklog()
  await assert.rejects(() => registrarPropuestaAjuste(db, { ...propuestaValida, aplicar: true }), /sólo registra propuestas/)
  await assert.rejects(() => registrarPropuestaAjuste(db, { ...propuestaValida, estado: 'aplicada' }), /sólo registra propuestas/)
  assert.equal(db.rows.length, 0)
})
