import type { SupabaseClient } from '@supabase/supabase-js'
import type { Integracion } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getIntegraciones(supabase: SupabaseClient): Promise<ServiceResult<Integracion[]>> {
  try {
    const { data, error } = await supabase
      .from('integraciones')
      .select(
        'slug, nombre, dato, direccion, fuente_verdad, metodo, frecuencia, estado, politica, ultimo_sync, salud, notas, updated_at',
      )
    if (error) return { data: null, error: error.message }
    return { data: (data ?? []) as Integracion[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
