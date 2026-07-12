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
