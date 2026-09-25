// LAS TAREAS EN CURSO DE UNA OBRA, PARA LA PORTADA DEL JEFE EN LA PC (/obras/hoy, 25/09/2026).
//
// «Frentes de hoy» listaba rubros, épicas e historias —contenedores— con «sin cuadrilla» en ámbar en
// todas las filas. Un frente en curso es una TAREA que está andando: en curso o bloqueada, con avance
// parcial, con horas imputadas hoy, o con su plan abierto hoy y sin terminar. Cada una con su estado,
// sus horas de hoy, su parte y SU avance. Función pura: la prueba la ejercita sin la base.

import type { ActividadDelJefe, HHDelDia } from './jefeService'

export interface TareaEnCurso {
  id: string
  nombre: string
  cuadrilla: string | null
  pct: number | null
  personasHoy: number
  hhHoy: number
  parteHoy: boolean
  estado: { palabra: string; tono: 'neg' | 'warn' | 'ink' | 'faint' }
}

export function tareasEnCurso(actividades: readonly ActividadDelJefe[], hh: readonly HHDelDia[], hoy: string): TareaEnCurso[] {
  const personas = new Map<string, Set<string>>()
  const horas = new Map<string, number>()
  for (const h of hh) {
    const s = personas.get(h.actividad_id) ?? new Set<string>()
    s.add(h.persona_id)
    personas.set(h.actividad_id, s)
    horas.set(h.actividad_id, (horas.get(h.actividad_id) ?? 0) + h.horas)
  }
  return actividades
    .filter((a) => a.tipo !== 'resumen')
    .filter((a) => {
      const pct = a.avance_pct
      if (pct != null && pct >= 100) return false
      if (a.estado_operativo === 'en_curso' || a.estado_operativo === 'bloqueada') return true
      if (pct != null && pct > 0) return true
      if ((horas.get(a.actividad_id) ?? 0) > 0) return true
      return a.inicio_plan != null && a.inicio_plan.slice(0, 10) <= hoy && (a.fin_plan ?? a.inicio_plan).slice(0, 10) >= hoy
    })
    .map((a) => {
      const personasHoy = personas.get(a.actividad_id)?.size ?? 0
      const atrasada = a.fin_plan != null && a.fin_plan.slice(0, 10) < hoy
      const estado = a.impedimentos_abiertos > 0 || a.estado_operativo === 'bloqueada'
        ? { palabra: 'parada', tono: 'neg' as const }
        : atrasada
          ? { palabra: 'atrasada', tono: 'warn' as const }
          : personasHoy > 0
            ? { palabra: 'en curso', tono: 'ink' as const }
            : { palabra: 'sin horas hoy', tono: 'faint' as const }
      return {
        id: a.actividad_id, nombre: a.nombre, cuadrilla: a.cuadrilla_prevista, pct: a.avance_pct,
        personasHoy, hhHoy: horas.get(a.actividad_id) ?? 0, parteHoy: a.ultimo_parte?.slice(0, 10) === hoy, estado,
      }
    })
    .sort((x, y) => ORDEN[x.estado.tono] - ORDEN[y.estado.tono] || x.nombre.localeCompare(y.nombre))
}

const ORDEN = { neg: 0, warn: 1, ink: 2, faint: 3 } as const
