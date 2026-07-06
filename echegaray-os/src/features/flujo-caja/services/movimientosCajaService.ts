import type { SupabaseClient } from '@supabase/supabase-js'
import type { MovimientoCaja, MovimientoCajaInput } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getMovimientosCaja(
  supabase: SupabaseClient
): Promise<ServiceResult<MovimientoCaja[]>> {
  try {
    const { data, error } = await supabase
      .from('movimientos_caja')
      .select('*')
      .order('fecha_esperada', { ascending: false })
    if (error) return { data: null, error: error.message }
    return { data: data as MovimientoCaja[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function insertMovimientoCaja(
  supabase: SupabaseClient,
  input: MovimientoCajaInput
): Promise<ServiceResult<MovimientoCaja>> {
  try {
    const { data, error } = await supabase
      .from('movimientos_caja')
      .insert({
        tipo: input.tipo,
        estado: input.estado,
        monto: input.monto,
        cuenta_financiera_id: input.cuenta_financiera_id,
        fecha_esperada: input.fecha_esperada,
        fecha_real: input.fecha_real ?? null,
        cliente_id: input.cliente_id ?? null,
        proveedor_id: input.proveedor_id ?? null,
        obra_id: input.obra_id ?? null,
        concepto: input.concepto,
        origen: input.origen,
        referencia_externa: input.referencia_externa ?? null,
        notas: input.notas ?? null,
      })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as MovimientoCaja, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
