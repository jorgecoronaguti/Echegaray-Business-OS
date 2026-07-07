import type { SupabaseClient } from '@supabase/supabase-js'
import type { Adicional, AdicionalInput, ActualizarAdicionalInput } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getAdicionalesPorObra(
  supabase: SupabaseClient,
  obraId: string
): Promise<ServiceResult<Adicional[]>> {
  try {
    const { data, error } = await supabase
      .from('adicionales')
      .select('*')
      .eq('obra_id', obraId)
      .order('fecha_deteccion', { ascending: false })
    if (error) return { data: null, error: error.message }
    return { data: data as Adicional[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

// Sin filtro de obra — usado por el Dashboard de Dirección (PRP-011).
export async function getAdicionalesTodasLasObras(
  supabase: SupabaseClient
): Promise<ServiceResult<Adicional[]>> {
  try {
    const { data, error } = await supabase
      .from('adicionales')
      .select('*')
      .order('fecha_deteccion', { ascending: false })
    if (error) return { data: null, error: error.message }
    return { data: data as Adicional[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function insertAdicional(
  supabase: SupabaseClient,
  input: AdicionalInput
): Promise<ServiceResult<Adicional>> {
  try {
    const { data, error } = await supabase
      .from('adicionales')
      .insert({
        obra_id: input.obra_id,
        concepto: input.concepto,
        origen: input.origen,
        detectado_por: input.detectado_por,
        fecha_deteccion: input.fecha_deteccion,
      })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as Adicional, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

// Actualiza solo las columnas provistas — cada llamada registra el avance de una
// etapa (cotización, aprobación, ejecución, facturación o cobranza) sin tocar el
// resto del historial ya cargado.
export async function actualizarAdicional(
  supabase: SupabaseClient,
  id: string,
  input: ActualizarAdicionalInput
): Promise<ServiceResult<Adicional>> {
  try {
    const cambios: Record<string, unknown> = {}
    if (input.fecha_cotizacion !== undefined) cambios.fecha_cotizacion = input.fecha_cotizacion
    if (input.monto_cotizado !== undefined) cambios.monto_cotizado = input.monto_cotizado
    if (input.fecha_aprobacion !== undefined) cambios.fecha_aprobacion = input.fecha_aprobacion
    if (input.monto_aprobado !== undefined) cambios.monto_aprobado = input.monto_aprobado
    if (input.fecha_ejecucion !== undefined) cambios.fecha_ejecucion = input.fecha_ejecucion
    if (input.fecha_facturacion !== undefined) cambios.fecha_facturacion = input.fecha_facturacion
    if (input.monto_facturado !== undefined) cambios.monto_facturado = input.monto_facturado
    if (input.referencia_factura !== undefined) cambios.referencia_factura = input.referencia_factura
    if (input.fecha_cobranza !== undefined) cambios.fecha_cobranza = input.fecha_cobranza
    if (input.monto_cobrado !== undefined) cambios.monto_cobrado = input.monto_cobrado
    if (input.movimiento_caja_id !== undefined) cambios.movimiento_caja_id = input.movimiento_caja_id
    if (input.frenado !== undefined) cambios.frenado = input.frenado
    if (input.motivo_frenado !== undefined) cambios.motivo_frenado = input.motivo_frenado
    if (input.notas !== undefined) cambios.notas = input.notas

    const { data, error } = await supabase.from('adicionales').update(cambios).eq('id', id).select().single()
    if (error) return { data: null, error: error.message }
    return { data: data as Adicional, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
