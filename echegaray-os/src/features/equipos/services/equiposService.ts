import type { SupabaseClient } from '@supabase/supabase-js'
import type { Equipo, EquipoInput } from '../types'

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

export async function insertEquipo(supabase: SupabaseClient, input: EquipoInput): Promise<ServiceResult<Equipo>> {
  try {
    const { data, error } = await supabase
      .from('equipos')
      .insert({
        nombre: input.nombre,
        tipo: input.tipo,
        patente_o_identificador: input.patente_o_identificador ?? null,
        notas: input.notas ?? null,
        fuente_legacy: 'OS',
      })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as Equipo, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function eliminarEquipo(supabase: SupabaseClient, id: string): Promise<ServiceResult<null>> {
  try {
    const { error } = await supabase.from('equipos').delete().eq('id', id)
    if (error) return { data: null, error: error.message }
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
