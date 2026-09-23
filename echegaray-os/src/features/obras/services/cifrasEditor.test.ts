import test from 'node:test'
import assert from 'node:assert/strict'
import { cifrasDelEditor } from './cifrasEditor.ts'
import type { Actividad } from '../types/index.ts'

// LA CABECERA DEL C06 dice cuatro cosas de la obra y ninguna puede ser un cero inventado: sin plan
// no hay plazo ni días hábiles; una obra sin sellar dice «sin sellar», no «copia del plan».

const act = (p: Partial<Actividad> & { id: string; nombre: string }): Actividad => ({
  obra_id: 'o', tipo: 'tarea', orden: 1, archivada: false, actividad_padre_id: null,
  inicio_plan: null, fin_plan: null, inicio_base: null, fin_base: null, avance_pct: null,
  ...p,
} as Actividad)

test('con plan y sin sellar: plazo en dd/mm, días hábiles de la vista, con fechas contadas, «sin sellar»', () => {
  const c = cifrasDelEditor({
    fechaInicioPlan: '2026-08-24', fechaFinPlan: '2026-09-22', diasHabilesPlan: 21,
    actividades: [
      act({ id: 'a', nombre: 'Excavación', inicio_plan: '2026-08-24', fin_plan: '2026-08-28' }),
      act({ id: 'b', nombre: 'Hormigón' }),
    ],
  })
  assert.deepEqual(c.map((x) => [x.rotulo, x.valor ?? `∅ ${x.falta}`]), [
    ['Plazo', '24/08 → 22/09'],
    ['Días hábiles', '21'],
    ['Con fechas', '1 de 2'],
    ['Línea base', '∅ sin sellar'],
  ])
})

test('sin plan: nombra qué falta, nunca 0; sellada: «copia del plan» tenue', () => {
  const c = cifrasDelEditor({
    fechaInicioPlan: '2026-08-24', fechaFinPlan: null, diasHabilesPlan: null,
    actividades: [act({ id: 'a', nombre: 'Excavación', inicio_plan: '2026-08-24', fin_plan: '2026-08-28', inicio_base: '2026-08-24', fin_base: '2026-08-28' })],
  })
  assert.equal(c[0].valor, null); assert.equal(c[0].falta, 'sin fecha de fin')
  assert.equal(c[1].valor, null); assert.equal(c[1].falta, 'sin plan')
  assert.equal(c[2].valor, '1 de 1')
  assert.deepEqual(c[3], { rotulo: 'Línea base', valor: 'copia del plan', italica: true })
  assert.equal(cifrasDelEditor({ fechaInicioPlan: null, fechaFinPlan: null, diasHabilesPlan: null, actividades: [] })[2].valor, '0 de 0')
})
