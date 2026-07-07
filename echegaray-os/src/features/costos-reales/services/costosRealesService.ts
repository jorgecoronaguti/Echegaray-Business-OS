import type { SupabaseClient } from '@supabase/supabase-js'
import type { CostoReal, CostoRealInput } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getCostosRealesPorObra(
  supabase: SupabaseClient,
  obraId: string
): Promise<ServiceResult<CostoReal[]>> {
  try {
    const { data, error } = await supabase
      .from('costos_reales')
      .select('*')
      .eq('obra_id', obraId)
      .order('fecha', { ascending: false })
    if (error) return { data: null, error: error.message }
    return { data: data as CostoReal[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function insertCostoReal(
  supabase: SupabaseClient,
  input: CostoRealInput
): Promise<ServiceResult<CostoReal>> {
  try {
    const { data, error } = await supabase
      .from('costos_reales')
      .insert({
        obra_id: input.obra_id,
        proveedor_id: input.proveedor_id ?? null,
        concepto: input.concepto,
        monto: input.monto,
        fecha: input.fecha,
        estado: input.estado,
        movimiento_caja_id: input.movimiento_caja_id ?? null,
        compra_id: input.compra_id ?? null,
        fuente_legacy: input.fuente_legacy,
        notas: input.notas ?? null,
      })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as CostoReal, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
