import type { SupabaseClient } from '@supabase/supabase-js'

export interface Herramienta {
  id_herramienta: string
  nombre: string
  ubicacion_actual: string | null
  imagen_url: string | null
  fecha: string | null
  origen: string | null
}

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

export async function getHerramientas(supabase: SupabaseClient): Promise<ServiceResult<Herramienta[]>> {
  try {
    const { data, error } = await supabase
      .from('herramientas')
      .select('id_herramienta, nombre, ubicacion_actual, imagen_url, fecha, origen')
      .order('nombre', { ascending: true })
    if (error) return { data: null, error: error.message }
    return { data: (data ?? []) as Herramienta[], error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Error desconocido' }
  }
}
