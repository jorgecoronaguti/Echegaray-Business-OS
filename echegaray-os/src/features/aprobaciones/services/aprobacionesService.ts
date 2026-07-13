import type { SupabaseClient } from '@supabase/supabase-js'
import type { PendingOperation } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

/** Cola de operaciones pendientes (efectos externos Nivel E que esperan aprobación). */
export async function getPendingOperations(
  supabase: SupabaseClient,
): Promise<ServiceResult<PendingOperation[]>> {
  try {
    const { data, error } = await supabase
      .from('orq_pending_operations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) return { data: null, error: error.message }
    return { data: data as PendingOperation[], error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Error al conectar con Supabase' }
  }
}
