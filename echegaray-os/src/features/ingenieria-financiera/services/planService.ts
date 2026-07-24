import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlanVigente, SeguimientoTarea } from '../types/plan'

// Lee el Plan de Tesorería vigente y el estado real de sus tareas. Todo ya lo calculó el motor: acá
// SÓLO se lee. La Web nunca recalcula un plan ni crea una tarea.

/** El plan optimizado vigente + su estado (pendiente_ejecucion / autorizado / ejecutado) + qué cambió. */
export async function getPlanVigente(
  supabase: SupabaseClient,
): Promise<{ data?: PlanVigente; error?: string }> {
  const { data, error } = await supabase
    .from('finanzas_plan_vigente')
    .select('estado, horizonte, plan, cambios, calculado_en, autorizado_por, correlation_id')
    .eq('id', 1)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Todavía no hay un plan de tesorería calculado.' }
  return { data: data as PlanVigente }
}

/**
 * El estado real de las tareas del plan ejecutado, leído del Work Fabric (vista pública orq_tasks).
 * Se filtra por el correlation_id que quedó guardado al ejecutar: todas las tareas de esa ejecución lo
 * comparten. Sin ejecución todavía, no hay tareas (y el seguimiento no se muestra).
 */
export async function getSeguimiento(
  supabase: SupabaseClient,
  correlationId: string | null,
): Promise<{ data: SeguimientoTarea[]; error?: string }> {
  if (!correlationId) return { data: [] }
  const { data, error } = await supabase
    .from('orq_tasks')
    .select('title, state, agent_slug, error, result, evidence, updated_at')
    .eq('correlation_id', correlationId)

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as SeguimientoTarea[] }
}
