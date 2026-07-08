import { z } from 'zod'

// O1-B — Ciclo Semanal Real de Obra. Grano operacional: actividad en texto libre +
// responsable + personas/tiempo (NO partida presupuestaria rígida, NO CPM/Gantt
// pesado) — elegido con evidencia real (ver o1-a-obra-piloto-base-operacional.md y el
// tracker Gantt de Drive). Mismo criterio que registros_hh (PRP-008): texto libre,
// sin cuadrilla/legajo formal.
// Columnas en snake_case, igual que la tabla en Supabase.
// Ver supabase/migrations/20260708115400_actividades_semanales_obra.sql

export interface ActividadSemanal {
  id: string
  obra_id: string
  semana_inicio: string
  actividad: string
  partida_id: string | null
  frente: string | null
  responsable: string
  avance_objetivo: number | null
  hh_objetivo: number | null
  restricciones: string | null
  avance_real: number | null
  hh_real: number | null
  causa_desvio: string | null
  estado: 'planificada' | 'en_curso' | 'cerrada'
  fuente_legacy: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

// Alta de plan (Lunes / inicio de semana) — solo lo que el jefe de obra define.
export const planSemanalInputSchema = z.object({
  obra_id: z.string().uuid('Obra inválida'),
  semana_inicio: z.string().min(1, 'La semana es obligatoria'),
  actividad: z.string().trim().min(1, 'Indicá la actividad'),
  partida_id: z.string().uuid('Partida inválida').optional(),
  frente: z.string().trim().min(1).optional(),
  responsable: z.string().trim().min(1, 'Indicá el responsable'),
  avance_objetivo: z.coerce.number().min(0).max(100).optional(),
  hh_objetivo: z.coerce.number().positive('Las HH objetivo deben ser mayores a 0').optional(),
  restricciones: z.string().trim().min(1).optional(),
  fuente_legacy: z.string().trim().min(1).optional(),
})
export type PlanSemanalInput = z.infer<typeof planSemanalInputSchema>

// Cierre de semana (Viernes) — SOLO lo que el sistema no puede conocer por otra vía:
// avance real y causa de desvío. HH real se ofrece como campo opcional únicamente
// porque hoy no hay ninguna fuente automática que la calcule por actividad (registros_hh
// es a nivel obra, no actividad) — ver PRP-008 y O1-C. Si en el futuro existe una fuente
// confiable de HH por actividad, este campo debe dejar de pedirse acá.
export const cierreSemanalInputSchema = z.object({
  avance_real: z.coerce.number().min(0).max(100),
  hh_real: z.coerce.number().positive().optional(),
  causa_desvio: z.string().trim().min(1).optional(),
})
export type CierreSemanalInput = z.infer<typeof cierreSemanalInputSchema>

function inicioSemana(fecha: Date): Date {
  const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()))
  const diaSemana = d.getUTCDay()
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana
  d.setUTCDate(d.getUTCDate() + offset)
  return d
}

export function inicioSemanaISO(fecha: Date = new Date()): string {
  return inicioSemana(fecha).toISOString().slice(0, 10)
}

// Clasificación de desvío por actividad — dato CALCULADO a partir de dos datos
// OBSERVADOS (avance_objetivo, avance_real) cuando ambos existen. Nunca inventa
// precisión: si falta uno de los dos, no hay desvío calculable.
export type NivelDesvioActividad = 'sin_dato' | 'cumplido' | 'leve' | 'significativo'

export const UMBRAL_DESVIO_LEVE = 10 // puntos porcentuales
export const UMBRAL_DESVIO_SIGNIFICATIVO = 25

export function calcularDesvioActividad(actividad: ActividadSemanal): {
  nivel: NivelDesvioActividad
  desvioPuntosPorcentuales: number | null
} {
  if (actividad.avance_objetivo == null || actividad.avance_real == null) {
    return { nivel: 'sin_dato', desvioPuntosPorcentuales: null }
  }
  const desvio = actividad.avance_real - actividad.avance_objetivo
  if (desvio >= 0) return { nivel: 'cumplido', desvioPuntosPorcentuales: desvio }
  const abs = Math.abs(desvio)
  if (abs >= UMBRAL_DESVIO_SIGNIFICATIVO) return { nivel: 'significativo', desvioPuntosPorcentuales: desvio }
  if (abs >= UMBRAL_DESVIO_LEVE) return { nivel: 'leve', desvioPuntosPorcentuales: desvio }
  return { nivel: 'cumplido', desvioPuntosPorcentuales: desvio }
}

export interface AlertaActividadSemanal {
  tipo: 'desvio_significativo' | 'restriccion_abierta' | 'sin_cierre'
  actividad: ActividadSemanal
  mensaje: string
}

// Alertas puras — mismo patrón que el resto del OS (calcularAlertasX). Solo excepciones,
// no todo el estado (principio de "administrador de excepciones" de la auditoría).
export function calcularAlertasActividadSemanal(actividades: ActividadSemanal[], hoy: Date = new Date()): AlertaActividadSemanal[] {
  const alertas: AlertaActividadSemanal[] = []
  for (const a of actividades) {
    const { nivel } = calcularDesvioActividad(a)
    if (nivel === 'significativo') {
      alertas.push({
        tipo: 'desvio_significativo',
        actividad: a,
        mensaje: `"${a.actividad}" (semana ${a.semana_inicio}): objetivo ${a.avance_objetivo}%, real ${a.avance_real}% -- desvío significativo.`,
      })
    }
    if (a.restricciones && a.estado !== 'cerrada') {
      alertas.push({
        tipo: 'restriccion_abierta',
        actividad: a,
        mensaje: `"${a.actividad}" tiene una restricción abierta: ${a.restricciones}`,
      })
    }
    const semanaInicio = new Date(a.semana_inicio + 'T00:00:00Z')
    const finSemana = new Date(semanaInicio)
    finSemana.setUTCDate(finSemana.getUTCDate() + 7)
    if (a.estado !== 'cerrada' && a.avance_real == null && finSemana.getTime() < hoy.getTime()) {
      alertas.push({
        tipo: 'sin_cierre',
        actividad: a,
        mensaje: `"${a.actividad}" (semana ${a.semana_inicio}) ya terminó y no tiene avance real informado.`,
      })
    }
  }
  return alertas
}
