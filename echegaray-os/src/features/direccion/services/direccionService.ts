import type { SupabaseClient } from '@supabase/supabase-js'
import type { DireccionObjetivo } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  return err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
}

/** Objetivos de Dirección (tareas type='direction') con progreso e informe. */
export async function getObjetivos(supabase: SupabaseClient): Promise<ServiceResult<DireccionObjetivo[]>> {
  try {
    const { data, error } = await supabase
      .from('orq_direction').select('*').order('created_at', { ascending: false }).limit(20)
    if (error) return { data: null, error: error.message }
    return { data: data as DireccionObjetivo[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

/** Cierres de objetivos (informe de consolidación del Director), por objective_id. */
export async function getCierres(supabase: SupabaseClient): Promise<ServiceResult<Record<string, unknown>>> {
  try {
    const { data, error } = await supabase
      .from('orq_objective_closure').select('objective_id, closure_state, closure, closed_at')
    if (error) return { data: null, error: error.message }
    const byId: Record<string, unknown> = {}
    for (const row of (data ?? []) as { objective_id: string }[]) byId[row.objective_id] = row
    return { data: byId, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

/** Conteos de negocio de titular (display, no lógica de negocio) para el encabezado. */
export async function getTitularesNegocio(supabase: SupabaseClient): Promise<ServiceResult<Record<string, number>>> {
  try {
    const counts: Record<string, number> = {}
    const pairs: [string, string, Record<string, unknown>?][] = [
      ['backlog', 'backlog_autonomo', { estado: 'abierto' }],
      ['acciones', 'acciones', undefined],
      ['obras', 'obras', undefined],
      ['obligaciones', 'obligaciones', undefined],
    ]
    for (const [key, table, filter] of pairs) {
      let qb = supabase.from(table).select('*', { count: 'exact', head: true })
      if (filter) for (const [k, v] of Object.entries(filter)) qb = qb.eq(k, v as string)
      const { count } = await qb
      counts[key] = count ?? 0
    }
    return { data: counts, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
