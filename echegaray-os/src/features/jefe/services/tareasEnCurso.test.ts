import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tareasEnCurso } from './tareasEnCurso.ts'
import type { ActividadDelJefe } from './jefeService.ts'

const act = (p: Partial<ActividadDelJefe> & { actividad_id: string }): ActividadDelJefe => ({
  nombre: p.actividad_id, tipo: 'tarea', metodo_avance: 'cantidad', avance_pct: null, unidad: null, cantidad_objetivo: null,
  impedimentos_abiertos: 0, obra_id: 'o', rubro: null, origen_avance: null, estado_operativo: 'pendiente', n_pasos: 0,
  n_pasos_hechos: 0, cuadrilla_prevista: null, hh_plan: null, hh_real: null, inicio_plan: null, fin_plan: null,
  inicio_real: null, fin_real: null, forecast_fin: null, estado_fecha: null, ultimo_parte: null, cantidad_ejecutada: null, ...p,
} as ActividadDelJefe)

test('los frentes en curso son tareas andando, no contenedores ni terminadas', () => {
  const hoy = '2026-09-25'
  const filas = tareasEnCurso([
    act({ actividad_id: 'rubro', tipo: 'resumen', avance_pct: 40 }),
    act({ actividad_id: 'hecha', avance_pct: 100, estado_operativo: 'hecha' }),
    act({ actividad_id: 'b0', avance_pct: 43, fin_plan: '2026-09-04' }),
    act({ actividad_id: 'hoy', inicio_plan: '2026-09-24', fin_plan: '2026-09-30' }),
    act({ actividad_id: 'futura', inicio_plan: '2026-10-05', fin_plan: '2026-10-09' }),
    act({ actividad_id: 'parada', estado_operativo: 'bloqueada', impedimentos_abiertos: 1 }),
  ], [{ persona_id: 'p', actividad_id: 'hoy', horas: 8, tipo_hora: 'normal' }], hoy)
  assert.deepEqual(filas.map((f) => [f.id, f.estado.palabra]), [['parada', 'parada'], ['b0', 'atrasada'], ['hoy', 'en curso']])
  assert.equal(filas[2].hhHoy, 8)
})
