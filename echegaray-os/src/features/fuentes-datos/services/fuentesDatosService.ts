import type { SupabaseClient } from '@supabase/supabase-js'
import type { FuenteDatos } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getFuentesDatos(supabase: SupabaseClient): Promise<ServiceResult<FuenteDatos[]>> {
  try {
    const { data, error } = await supabase
      .from('fuentes_datos')
      .select('*')
      .order('criticidad', { ascending: true })
      .order('nombre', { ascending: true })
    if (error) return { data: null, error: error.message }
    return { data: data as FuenteDatos[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
