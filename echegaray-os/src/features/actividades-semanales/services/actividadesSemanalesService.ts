import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActividadSemanal, PlanSemanalInput, CierreSemanalInput } from '@/features/actividades-semanales/types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

export async function getActividadesSemanales(
  supabase: SupabaseClient,
  obraId?: string
): Promise<ServiceResult<ActividadSemanal[]>> {
  let query = supabase.from('actividades_semanales').select('*').order('semana_inicio', { ascending: false })
  if (obraId) query = query.eq('obra_id', obraId)
  const { data, error } = await query
  if (error) return { data: null, error: error.message }
  return { data: data as ActividadSemanal[], error: null }
}

export async function getActividadesSemanalesTodasLasObras(
  supabase: SupabaseClient
): Promise<ServiceResult<ActividadSemanal[]>> {
  return getActividadesSemanales(supabase)
}

export async function insertPlanSemanal(
  supabase: SupabaseClient,
  input: PlanSemanalInput
): Promise<ServiceResult<ActividadSemanal>> {
  const { data, error } = await supabase
    .from('actividades_semanales')
    .insert({
      obra_id: input.obra_id,
      semana_inicio: input.semana_inicio,
      actividad: input.actividad,
      partida_id: input.partida_id ?? null,
      frente: input.frente ?? null,
      responsable: input.responsable,
      avance_objetivo: input.avance_objetivo ?? null,
      hh_objetivo: input.hh_objetivo ?? null,
      restricciones: input.restricciones ?? null,
      fuente_legacy: input.fuente_legacy ?? null,
      estado: 'planificada',
    })
    .select()
    .single()
  if (error) return { data: null, error: error.message }
  return { data: data as ActividadSemanal, error: null }
}

export async function cerrarSemanaActividad(
  supabase: SupabaseClient,
  actividadId: string,
  input: CierreSemanalInput
): Promise<ServiceResult<ActividadSemanal>> {
  const { data, error } = await supabase
    .from('actividades_semanales')
    .update({
      avance_real: input.avance_real,
      hh_real: input.hh_real ?? null,
      causa_desvio: input.causa_desvio ?? null,
      estado: 'cerrada',
    })
    .eq('id', actividadId)
    .select()
    .single()
  if (error) return { data: null, error: error.message }
  return { data: data as ActividadSemanal, error: null }
}
