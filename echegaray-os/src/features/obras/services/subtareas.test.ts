import test from 'node:test'
import assert from 'node:assert/strict'
import { esSubtarea, separarPlanYSubtareas } from './subtareas.ts'

const f = (id: string, tipo: string, padre: string | null = null) =>
  ({ id, tipo, actividad_padre_id: padre })

// ═══ EL DEFECTO QUE ESTE TEST ATRAPA ═══
// El filtro viejo era `!actividad_padre_id`. Después de `20260821T2000` esa columna cuelga a 161
// actividades reales de su rubro: con el filtro viejo, las 161 desaparecen del Gantt, de la Lista,
// del Tablero y de Próximos — sin un solo error. Revertir a `!actividad_padre_id` pone esta prueba
// en rojo.
test('la hija de un rubro ES una actividad del plan, no una subtarea', () => {
  const filas = [f('rubro', 'resumen'), f('act', 'tarea', 'rubro')]
  const porId = new Map(filas.map((x) => [x.id, x]))
  assert.equal(esSubtarea(filas[1], porId), false)
  assert.deepEqual(separarPlanYSubtareas(filas).plan.map((x) => x.id), ['rubro', 'act'])
})

test('la hija de una actividad ejecutable ES una subtarea y no va al plan', () => {
  const filas = [f('act', 'tarea'), f('sub', 'tarea', 'act')]
  const { plan, subtareas } = separarPlanYSubtareas(filas)
  assert.deepEqual(plan.map((x) => x.id), ['act'])
  assert.deepEqual(subtareas.get('act')?.map((x) => x.id), ['sub'])
})

// N NIVELES: el techo de tres se retiró de la base. Una actividad colgada de un frente, colgado de
// un sector, sigue siendo del plan por más hondo que esté.
test('la profundidad no convierte una actividad en subtarea', () => {
  const filas = [
    f('sector', 'resumen'), f('frente', 'resumen', 'sector'), f('act', 'tarea', 'frente'),
    f('sub', 'tarea', 'act'),
  ]
  const { plan, subtareas } = separarPlanYSubtareas(filas)
  assert.deepEqual(plan.map((x) => x.id), ['sector', 'frente', 'act'])
  assert.deepEqual([...subtareas.keys()], ['act'])
})

// UN PADRE QUE NO ESTÁ EN LA LISTA —archivado, o fuera de la ventana— NO ESCONDE A SU HIJA. Que una
// actividad desaparezca del plan porque su padre se archivó es exactamente el modo de falla que
// este archivo existe para impedir.
test('sin el padre a la vista, la fila se muestra en el plan en vez de desaparecer', () => {
  const filas = [f('act', 'tarea', 'padre-archivado')]
  assert.deepEqual(separarPlanYSubtareas(filas).plan.map((x) => x.id), ['act'])
})
