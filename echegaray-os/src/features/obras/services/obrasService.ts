import type { SupabaseClient } from '@supabase/supabase-js'
import type { Obra, ObraInput } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getObras(supabase: SupabaseClient): Promise<ServiceResult<Obra[]>> {
  try {
    const { data, error } = await supabase.from('obras').select('*').order('nombre')
    if (error) return { data: null, error: error.message }
    return { data: data as Obra[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function getObraById(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<Obra>> {
  try {
    const { data, error } = await supabase.from('obras').select('*').eq('id', id).single()
    if (error) return { data: null, error: error.message }
    return { data: data as Obra, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function insertObra(supabase: SupabaseClient, input: ObraInput): Promise<ServiceResult<Obra>> {
  try {
    const { data, error } = await supabase
      .from('obras')
      .insert({
        cliente_id: input.cliente_id,
        nombre: input.nombre,
        monto_contratado: input.monto_contratado,
        fecha_inicio: input.fecha_inicio,
        fecha_fin_objetivo: input.fecha_fin_objetivo,
        estado: input.estado,
      })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as Obra, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
