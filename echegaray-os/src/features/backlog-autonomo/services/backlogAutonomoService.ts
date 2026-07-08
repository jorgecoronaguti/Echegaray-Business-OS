import type { SupabaseClient } from '@supabase/supabase-js'
import type { Accion } from '@/features/acciones/types'
import { accionDesdeBacklog } from '../types'
import type { BacklogItem } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getBacklogAutonomo(supabase: SupabaseClient): Promise<ServiceResult<BacklogItem[]>> {
  try {
    const { data, error } = await supabase
      .from('backlog_autonomo')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) return { data: null, error: error.message }
    return { data: data as BacklogItem[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function insertAccionDesdeBacklog(
  supabase: SupabaseClient,
  item: BacklogItem,
  responsable?: string
): Promise<ServiceResult<Accion>> {
  try {
    const { data, error } = await supabase
      .from('acciones')
      .insert({ ...accionDesdeBacklog(item), responsable: responsable ?? null })
      .select()
      .single()
    if (error) {
      if (error.code === '23505') return { data: null, error: 'Este item de backlog ya fue convertido en una acción.' }
      return { data: null, error: error.message }
    }
    return { data: data as Accion, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
