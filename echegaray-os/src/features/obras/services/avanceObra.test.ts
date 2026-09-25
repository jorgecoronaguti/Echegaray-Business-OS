import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avancePorTareas, cifraAvanceObra } from './avanceObra.ts'
import { celdaAvanceCartera } from './carteraCanon.ts'

test('el avance por tareas es la regla de obra_avance: con fecha de plan, por HH si hay, si no promedio simple', () => {
  const t = (avance_pct: number | null, inicio_plan: string | null = '2026-09-01', hh_plan: number | null = null) => ({ avance_pct, inicio_plan, hh_plan })
  assert.equal(avancePorTareas([t(100), t(0), t(43)]), 48)
  assert.equal(avancePorTareas([t(100), t(0, null)]), 100, 'sin fecha de plan no cuenta')
  assert.equal(avancePorTareas([t(100, '2026-09-01', 30), t(0, '2026-09-01', 10)]), 75, 'con HH plan pondera por HH')
  assert.equal(avancePorTareas([t(null), t(null, null)]), null, 'nada medido no es 0 %')
  assert.equal(avancePorTareas([]), null)
})

test('la cartera y el Resumen dan el MISMO número para la misma obra (dueño 25/09: una sola definición)', () => {
  const quattropani = { avance_pct: 47, n_actividades_medidas: 86, n_actividades: 95 }
  const resumen = cifraAvanceObra(quattropani)
  assert.equal(resumen.valor, '47%')
  assert.equal(celdaAvanceCartera(quattropani).texto, resumen.valor)
  assert.equal(resumen.bajada, '86 de 95 tareas medidas')
  const vacia = { avance_pct: null, n_actividades_medidas: 0, n_actividades: 0 }
  assert.equal(cifraAvanceObra(vacia).valor, null)
  assert.equal(celdaAvanceCartera(vacia).texto, null)
  assert.equal(cifraAvanceObra(vacia).falta, 'sin tareas')
})
