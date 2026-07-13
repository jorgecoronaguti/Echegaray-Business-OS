import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrgSpecialist } from '../types'
import type { OrqTask, OrqEvent } from '@/features/orquestador/types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  return err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
}

/** Organigrama con métricas por especialista (vista public.orq_org). */
export async function getOrganizacion(supabase: SupabaseClient): Promise<ServiceResult<OrgSpecialist[]>> {
  try {
    const { data, error } = await supabase.from('orq_org').select('*').order('org_order')
    if (error) return { data: null, error: error.message }
    return { data: data as OrgSpecialist[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

/** Tareas recientes de especialistas (para historial + evidencia por rol). */
export async function getSpecialistTasks(supabase: SupabaseClient, limit = 60): Promise<ServiceResult<OrqTask[]>> {
  try {
    const { data, error } = await supabase
      .from('orq_tasks')
      .select('*')
      .in('type', ['specialist', 'direction_consolidate', 'code_change'])
      .order('updated_at', { ascending: false })
      .limit(limit)
    if (error) return { data: null, error: error.message }
    return { data: data as OrqTask[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

/** Eventos recientes de la organización (trabajo + aprobaciones + cierres). */
export async function getOrgEvents(supabase: SupabaseClient, limit = 40): Promise<ServiceResult<OrqEvent[]>> {
  try {
    const { data, error } = await supabase
      .from('orq_events')
      .select('*')
      .in('type', ['specialist.completed', 'specialist.approval_requested', 'direction.completed', 'direction.planned'])
      .order('id', { ascending: false })
      .limit(limit)
    if (error) return { data: null, error: error.message }
    return { data: data as OrqEvent[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
