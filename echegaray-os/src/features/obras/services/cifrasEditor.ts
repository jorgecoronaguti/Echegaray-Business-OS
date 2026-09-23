// LAS CIFRAS DE LA CABECERA DEL EDITOR DEL CRONOGRAMA (C06, 23/09/2026):
//
//   Plazo: 24/08 → 22/09 · Días hábiles: 21 · Con fechas: 14 de 17 · Línea base: sin sellar
//
// Se calculan del lado del servidor, en la página, con lo que la página ya tiene en la mano: las
// fechas de plan de la obra, las actividades vivas y `obra_dias_habiles.dias_habiles_plan`. Nada
// se vuelve a pedir y nada se inventa: sin plan, «sin fechas de plan»; sin días hábiles, «sin plan».

import { conFechas, filasDelPlan } from './cronogramaPlan.ts'
import type { Actividad } from '../types/index.ts'

export interface CifraDelEditor {
  rotulo: 'Plazo' | 'Días hábiles' | 'Con fechas' | 'Línea base'
  valor: string | null
  /** La palabra de la ausencia cuando `valor` es null. */
  falta?: string
  /** «copia del plan» se escribe tenue, como en el 03 y en la vista 05. */
  italica?: boolean
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export function cifrasDelEditor(input: {
  fechaInicioPlan: string | null
  fechaFinPlan: string | null
  actividades: readonly Actividad[]
  /** `obra_dias_habiles.dias_habiles_plan` · `null` = sin plan o sin lectura. */
  diasHabilesPlan: number | null
}): CifraDelEditor[] {
  const { fechaInicioPlan: ini, fechaFinPlan: fin } = input
  const plazo = ini && fin ? `${ddmm(ini)} → ${ddmm(fin)}` : null
  const faltaPlazo = ini ? 'sin fecha de fin' : fin ? 'sin fecha de inicio' : 'sin fechas de plan'
  const filas = filasDelPlan(input.actividades)
  const cf = conFechas(filas)
  const selladas = filas.filter((f) => f.nivel !== 0 && (f.inicioBase || f.finBase)).length
  return [
    { rotulo: 'Plazo', valor: plazo, falta: faltaPlazo },
    { rotulo: 'Días hábiles', valor: input.diasHabilesPlan == null ? null : String(input.diasHabilesPlan), falta: 'sin plan' },
    { rotulo: 'Con fechas', valor: `${cf.con} de ${cf.total}` },
    selladas > 0
      ? { rotulo: 'Línea base', valor: 'copia del plan', italica: true }
      : { rotulo: 'Línea base', valor: null, falta: 'sin sellar' },
  ]
}
