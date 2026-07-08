import type { SupabaseClient } from '@supabase/supabase-js'
import type { Equipo } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getEquipos(supabase: SupabaseClient): Promise<ServiceResult<Equipo[]>> {
  try {
    const { data, error } = await supabase.from('equipos').select('*').order('nombre', { ascending: true })
    if (error) return { data: null, error: error.message }
    return { data: data as Equipo[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
