import type { SupabaseClient } from '@supabase/supabase-js'
import type { RegistroHH, RegistroHHInput, ObraHHResumen } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getRegistrosHHPorObra(
  supabase: SupabaseClient,
  obraId: string
): Promise<ServiceResult<RegistroHH[]>> {
  try {
    const { data, error } = await supabase
      .from('registros_hh')
      .select('*')
      .eq('obra_id', obraId)
      .order('fecha_inicio_semana', { ascending: false })
    if (error) return { data: null, error: error.message }
    return { data: data as RegistroHH[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function getHHResumenPorObra(
  supabase: SupabaseClient,
  obraId: string
): Promise<ServiceResult<ObraHHResumen | null>> {
  try {
    const { data, error } = await supabase
      .from('obra_hh_resumen')
      .select('*')
      .eq('obra_id', obraId)
      .maybeSingle()
    if (error) return { data: null, error: error.message }
    return { data: data as ObraHHResumen | null, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function insertRegistroHH(
  supabase: SupabaseClient,
  input: RegistroHHInput
): Promise<ServiceResult<RegistroHH>> {
  try {
    const { data, error } = await supabase
      .from('registros_hh')
      .insert({
        obra_id: input.obra_id,
        trabajador_o_cuadrilla: input.trabajador_o_cuadrilla,
        categoria: input.categoria ?? null,
        fecha_inicio_semana: input.fecha_inicio_semana,
        horas: input.horas,
        costo_real_id: input.costo_real_id ?? null,
        fuente_legacy: input.fuente_legacy,
        notas: input.notas ?? null,
      })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as RegistroHH, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
