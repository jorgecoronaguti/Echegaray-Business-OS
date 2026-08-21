// EL ESTADO DEL PRESUPUESTO Y LO QUE HABILITA.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// Convertir un presupuesto en plan de obra escribe en `obra_actividad` con las HH y el análisis
// CONGELADOS. Si la pantalla ofreciera «Convertir a obra» sobre un presupuesto todavía en
// borrador, el plan saldría con el costo VIVO de la base maestra: dentro de tres meses, cuando el
// precio del cemento cambie, la obra tendría un plan hecho con números que nadie ofertó y el
// desvío se mediría contra una línea base que se movió sola.
//
// El segundo defecto es el estado que la pantalla acepta y la base rechaza. El mockup trae «En
// análisis» y «Vencida»; el CHECK de `cotizaciones` admite cinco valores y ninguno es ése.

import test from 'node:test'
import assert from 'node:assert/strict'
import { lecturaEstado, transicionesDe, puedeConvertir, puedeCongelar } from './estado.ts'
import type { PresupuestoCascada } from '../types/index.ts'

function p(over: Partial<PresupuestoCascada> = {}): PresupuestoCascada {
  return {
    id: 'p1', numero: 'COT-1', version: 1, vigente: true, estado: 'adjudicada', cliente: null,
    cliente_id: null, obra_nombre: null, obra_canonica_id: 'escuela', fecha_cotizacion: null,
    congelada_en: '2026-02-28T10:00:00Z', convertida_obra_id: null,
    pct_indirectos: 0, pct_gastos_generales: 0, pct_margen: 0, pct_financiero: 0, pct_impuestos: 0,
    costo_directo: 100, hh_previstas: 10, n_partidas: 2, n_sin_analisis: 0, n_sin_computo: 0,
    indirectos: 0, gastos_generales: 0, costo_total: 100, margen: 0, financiero: 0,
    subtotal_antes_impuestos: 100, impuestos: 0, precio_venta: 100, margen_sobre_precio_pct: 0,
    ...over,
  }
}

test('los cinco estados del CHECK tienen lectura, y ninguno inventa un sexto', () => {
  for (const e of ['borrador', 'enviada', 'adjudicada', 'perdida', 'anulada'] as const) {
    assert.equal(lecturaEstado(e).clave, e)
  }
})

test('un estado que la base tenga y el módulo no conozca se muestra crudo, no disfrazado', () => {
  const l = lecturaEstado('en_analisis')
  assert.equal(l.label, 'en_analisis')
  assert.equal(l.tono, 'nulo')
})

test('anulada NO cuenta como perdida: no se perdió contra nadie', () => {
  assert.equal(lecturaEstado('anulada').grupo, 'cerrado')
  assert.equal(lecturaEstado('perdida').grupo, 'cerrado')
  assert.equal(lecturaEstado('adjudicada').grupo, 'adjudicado')
  assert.equal(lecturaEstado('borrador').grupo, 'abierto')
  assert.equal(lecturaEstado('enviada').grupo, 'abierto')
})

test('de adjudicada no se retrocede: hay una obra colgando, se hace una versión nueva', () => {
  assert.deepEqual(transicionesDe('adjudicada'), [])
  assert.ok(transicionesDe('enviada').includes('adjudicada'))
  assert.ok(!transicionesDe('perdida').includes('borrador'))
})

test('NO se convierte un presupuesto que no está adjudicado', () => {
  const r = puedeConvertir(p({ estado: 'enviada' }))
  assert.equal(r.puede, false)
  assert.match(r.motivo!, /adjudicado/)
})

test('NO se convierte un presupuesto sin congelar: el plan saldría del costo de hoy', () => {
  const r = puedeConvertir(p({ congelada_en: null }))
  assert.equal(r.puede, false)
  assert.match(r.motivo!, /congela/)
})

test('NO se convierte sin obra vinculada: la actividad se crea dentro de una obra', () => {
  const r = puedeConvertir(p({ obra_canonica_id: null }))
  assert.equal(r.puede, false)
  assert.match(r.motivo!, /obra/)
})

test('adjudicado + congelado + con obra: se convierte', () => {
  assert.deepEqual(puedeConvertir(p()), { puede: true, motivo: null })
})

test('un presupuesto sin partidas no se congela: no hay composición que copiar', () => {
  const r = puedeCongelar(p({ congelada_en: null, n_partidas: 0 }))
  assert.equal(r.puede, false)
  assert.match(r.motivo!, /partidas/)
})

test('un presupuesto ya congelado no se vuelve a congelar — la base también se niega', () => {
  const r = puedeCongelar(p())
  assert.equal(r.puede, false)
  assert.match(r.motivo!, /versión nueva/)
})
