import type { SupabaseClient } from '@supabase/supabase-js'
import type { ObraResumenEconomico } from '../types'
import type { CostoReal } from '@/features/costos-reales/types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getResumenEconomicoPorObra(
  supabase: SupabaseClient,
  obraId: string
): Promise<ServiceResult<ObraResumenEconomico | null>> {
  try {
    const { data, error } = await supabase
      .from('obra_resumen_economico')
      .select('*')
      .eq('obra_id', obraId)
      .maybeSingle()
    if (error) return { data: null, error: error.message }
    return { data: data as ObraResumenEconomico | null, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

// Costos que más explican el desvío: los de mayor monto primero, no los más recientes
// (a diferencia de getCostosRealesPorObra, que ordena por fecha para la ficha general).
export async function getCostosQueExplicanDesvio(
  supabase: SupabaseClient,
  obraId: string,
  limite = 5
): Promise<ServiceResult<CostoReal[]>> {
  try {
    const { data, error } = await supabase
      .from('costos_reales')
      .select('*')
      .eq('obra_id', obraId)
      .order('monto', { ascending: false })
      .limit(limite)
    if (error) return { data: null, error: error.message }
    return { data: data as CostoReal[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
