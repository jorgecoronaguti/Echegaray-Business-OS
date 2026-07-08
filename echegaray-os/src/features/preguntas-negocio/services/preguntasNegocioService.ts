import type { SupabaseClient } from '@supabase/supabase-js'
import type { PreguntaNegocio } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getPreguntasNegocio(supabase: SupabaseClient): Promise<ServiceResult<PreguntaNegocio[]>> {
  try {
    const { data, error } = await supabase
      .from('preguntas_negocio')
      .select('*')
      .order('dominio', { ascending: true })
    if (error) return { data: null, error: error.message }
    return { data: data as PreguntaNegocio[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
