// Tests del núcleo puro del sync del scorecard (F6). Sin BD: prueban que las filas se arman leyendo la
// fuente única, que lo que falta se marca 'sin_datos' (nunca inventado) y que la precisión del forecast
// se calcula bien cuando hay pares reales y devuelve 'sin_datos' cuando no los hay.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  construirSaludArea,
  resumirFrescura,
  medirPrecisionForecast,
  construirMetricasOs,
  anotarTendencia,
} from './sync-scorecard-finanzas.mjs'

// ── SALUD DEL ÁREA ──────────────────────────────────────────────────────────

test('construirSaludArea copia los leaves del modelo y apunta a la fuente única', () => {
  const modelo = {
    colchon_total: 25265932,
    disponible: { estado: 'ok', caja_hoy: 19867157, proyeccion_7dias: 68977993, cobranzas_vencidas: 4533196, cobranzas_por_cobrar_mes: 37714791 },
    comprometido: { estado: 'ok', saldo_total: 31690801, vencido: 4700000 },
    deuda_comercial: { estado: 'ok', vencido: 8101225 },
  }
  const filas = construirSaludArea(modelo)
  const caja = filas.find((f) => f.metrica === 'caja_hoy')
  assert.equal(caja.valor, 19867157)
  assert.equal(caja.estado, 'ok')
  assert.equal(caja.fuente_unica, 'finanzas_modelo_liquidez')
  assert.equal(filas.find((f) => f.metrica === 'obligaciones_saldo').valor, 31690801)
  assert.ok(filas.every((f) => f.seccion === 'salud_area'))
})

test('construirSaludArea: bloque "sin dato" del modelo → valor null y estado sin_datos, nunca 0 inventado', () => {
  const modelo = {
    colchon_total: 100,
    disponible: { estado: 'sin dato' },
    comprometido: { estado: 'ok', saldo_total: 5, vencido: 1 },
    deuda_comercial: { estado: 'ok', vencido: 2 },
  }
  const caja = construirSaludArea(modelo).find((f) => f.metrica === 'caja_hoy')
  assert.equal(caja.valor, null)
  assert.equal(caja.estado, 'sin_datos')
  assert.ok(caja.detalle.de_donde_saldria.includes('finanzas_modelo_liquidez'))
})

test('construirSaludArea: sin foto del modelo → todo sin_datos', () => {
  const filas = construirSaludArea(null)
  assert.ok(filas.length > 0)
  assert.ok(filas.every((f) => f.estado === 'sin_datos' && f.valor === null))
})

// ── FRESCURA ─────────────────────────────────────────────────────────────────

test('resumirFrescura calcula % actualizado, con problema y críticas con problema', () => {
  const fuentes = [
    { estado: 'actualizado', criticidad: 'alta' },
    { estado: 'actualizado', criticidad: 'media' },
    { estado: 'atrasado', criticidad: 'alta' },
    { estado: 'error', criticidad: 'media' },
    { estado: 'fuente_no_disponible', criticidad: 'alta' },
  ]
  const r = resumirFrescura(fuentes)
  assert.equal(r.total, 5)
  assert.equal(r.actualizadas, 2)
  assert.equal(r.pct_actualizado, 40)
  assert.equal(r.con_problema, 3)
  assert.equal(r.criticas_con_problema, 2)
})

test('resumirFrescura sin fuentes → pct null (sin_datos), no divide por cero', () => {
  const r = resumirFrescura([])
  assert.equal(r.total, 0)
  assert.equal(r.pct_actualizado, null)
})

// ── PRECISIÓN DEL FORECAST ────────────────────────────────────────────────────

test('medirPrecisionForecast: sin caja negra → sin_datos con de_donde_saldria', () => {
  const r = medirPrecisionForecast([], { hoy: '2026-08-01' })
  assert.equal(r.estado, 'sin_datos')
  assert.equal(r.precision_pct, null)
  assert.equal(r.n_pares, 0)
  assert.ok(r.detalle.de_donde_saldria.includes('finanzas_caja_negra'))
})

test('medirPrecisionForecast: cruza predicción vencida con la caja real observada', () => {
  const rows = [
    // Predicción hecha el 20/07 para el 25/07.
    { fuente: 'calendario', metrica: 'saldo_final_proyectado', fecha_objetivo: '2026-07-25', valor: 10_000_000, estado: 'ok', registrado_en: '2026-07-20T10:00:00Z' },
    // Realidad observada el 25/07 (modelo caja_hoy).
    { fuente: 'modelo', metrica: 'caja_hoy', fecha_objetivo: null, valor: 9_000_000, estado: 'ok', registrado_en: '2026-07-25T09:00:00Z' },
  ]
  const r = medirPrecisionForecast(rows, { hoy: '2026-07-27' })
  assert.equal(r.estado, 'ok')
  assert.equal(r.n_pares, 1)
  // ape = |10M-9M|/9M = 0.111 → precisión ≈ 88.9%
  assert.ok(Math.abs(r.precision_pct - 88.9) < 0.2, `precision fue ${r.precision_pct}`)
})

test('medirPrecisionForecast: ignora predicciones del futuro y las hechas el mismo día', () => {
  const rows = [
    // Objetivo futuro respecto de hoy: no medible aún.
    { fuente: 'calendario', metrica: 'saldo_final_proyectado', fecha_objetivo: '2026-08-10', valor: 1, estado: 'ok', registrado_en: '2026-07-20T10:00:00Z' },
    // Registrada el mismo día objetivo: no es pronóstico.
    { fuente: 'calendario', metrica: 'saldo_final_proyectado', fecha_objetivo: '2026-07-25', valor: 1, estado: 'ok', registrado_en: '2026-07-25T10:00:00Z' },
    { fuente: 'modelo', metrica: 'caja_hoy', valor: 9_000_000, estado: 'ok', registrado_en: '2026-07-25T09:00:00Z' },
  ]
  const r = medirPrecisionForecast(rows, { hoy: '2026-07-27' })
  assert.equal(r.estado, 'sin_datos')
  assert.equal(r.n_pares, 0)
})

// ── MÉTRICAS OS + TENDENCIA ────────────────────────────────────────────────────

test('construirMetricasOs incluye frescura real y capacidades sin_datos declaradas', () => {
  const frescura = resumirFrescura([{ estado: 'actualizado', criticidad: 'alta' }, { estado: 'atrasado', criticidad: 'alta' }])
  const precision = medirPrecisionForecast([])
  const filas = construirMetricasOs(frescura, precision)
  const fp = filas.find((f) => f.metrica === 'forecast_precision')
  assert.equal(fp.estado, 'sin_datos')
  const fr = filas.find((f) => f.metrica === 'frescura_pct')
  assert.equal(fr.valor, 50)
  assert.equal(fr.estado, 'ok')
  const auto = filas.find((f) => f.metrica === 'auto_imputacion_pct')
  assert.equal(auto.estado, 'sin_datos')
  assert.ok(auto.detalle.de_donde_saldria.length > 0)
})

test('anotarTendencia agrega valor_anterior y variacion contra el snapshot previo', () => {
  const filas = [{ seccion: 'salud_area', metrica: 'caja_hoy', valor: 12, detalle: null }]
  const previas = [{ seccion: 'salud_area', metrica: 'caja_hoy', valor: 10 }]
  const [f] = anotarTendencia(filas, previas)
  assert.equal(f.detalle.valor_anterior, 10)
  assert.equal(f.detalle.variacion, 2)
})

test('anotarTendencia no inventa tendencia si no hay previo o el valor es null', () => {
  const filas = [
    { seccion: 'salud_area', metrica: 'caja_hoy', valor: 12, detalle: null },
    { seccion: 'metricas_os', metrica: 'forecast_precision', valor: null, estado: 'sin_datos', detalle: { x: 1 } },
  ]
  const out = anotarTendencia(filas, [])
  assert.equal(out[0].detalle, null)
  assert.equal(out[1].detalle.variacion, undefined)
})
