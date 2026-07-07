import type { SupabaseClient } from '@supabase/supabase-js'
import type { Obligacion, ObligacionInput, ObligacionResumen, AplicacionPagoInput } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getObligaciones(supabase: SupabaseClient): Promise<ServiceResult<Obligacion[]>> {
  try {
    const { data, error } = await supabase
      .from('obligaciones')
      .select('*')
      .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
    if (error) return { data: null, error: error.message }
    return { data: data as Obligacion[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function getObligacionesPorObra(
  supabase: SupabaseClient,
  obraId: string
): Promise<ServiceResult<Obligacion[]>> {
  try {
    const { data, error } = await supabase
      .from('obligaciones')
      .select('*')
      .eq('obra_id', obraId)
      .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
    if (error) return { data: null, error: error.message }
    return { data: data as Obligacion[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function getObligacionesResumen(
  supabase: SupabaseClient
): Promise<ServiceResult<ObligacionResumen[]>> {
  try {
    const { data, error } = await supabase.from('obligacion_resumen').select('*')
    if (error) return { data: null, error: error.message }
    return { data: data as ObligacionResumen[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function getObligacionesResumenPorObra(
  supabase: SupabaseClient,
  obraId: string
): Promise<ServiceResult<ObligacionResumen[]>> {
  try {
    const { data, error } = await supabase.from('obligacion_resumen').select('*').eq('obra_id', obraId)
    if (error) return { data: null, error: error.message }
    return { data: data as ObligacionResumen[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function insertObligacion(
  supabase: SupabaseClient,
  input: ObligacionInput
): Promise<ServiceResult<Obligacion>> {
  try {
    const { data, error } = await supabase
      .from('obligaciones')
      .insert({
        obra_id: input.obra_id ?? null,
        proveedor_id: input.proveedor_id ?? null,
        compra_id: input.compra_id ?? null,
        costo_real_id: input.costo_real_id ?? null,
        concepto: input.concepto,
        monto_total: input.monto_total,
        fecha_origen: input.fecha_origen,
        fecha_vencimiento: input.fecha_vencimiento ?? null,
        fuente_legacy: input.fuente_legacy,
        notas: input.notas ?? null,
      })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as Obligacion, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function insertAplicacionPago(
  supabase: SupabaseClient,
  input: AplicacionPagoInput
): Promise<ServiceResult<{ id: string }>> {
  try {
    const { data, error } = await supabase
      .from('aplicaciones_pago')
      .insert({
        obligacion_id: input.obligacion_id,
        movimiento_caja_id: input.movimiento_caja_id,
        monto_aplicado: input.monto_aplicado,
        notas: input.notas ?? null,
      })
      .select('id')
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as { id: string }, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
