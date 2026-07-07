import type { SupabaseClient } from '@supabase/supabase-js'
import type { Compra, CompraInput, ActualizarCompraInput, CompraResumen } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getComprasPorObra(
  supabase: SupabaseClient,
  obraId: string
): Promise<ServiceResult<Compra[]>> {
  try {
    const { data, error } = await supabase
      .from('compras')
      .select('*')
      .eq('obra_id', obraId)
      .order('fecha_necesidad', { ascending: false })
    if (error) return { data: null, error: error.message }
    return { data: data as Compra[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function getComprasResumenPorObra(
  supabase: SupabaseClient,
  obraId: string
): Promise<ServiceResult<CompraResumen[]>> {
  try {
    const { data, error } = await supabase
      .from('compra_resumen')
      .select('*')
      .eq('obra_id', obraId)
    if (error) return { data: null, error: error.message }
    return { data: data as CompraResumen[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function insertCompra(
  supabase: SupabaseClient,
  input: CompraInput
): Promise<ServiceResult<Compra>> {
  try {
    const { data, error } = await supabase
      .from('compras')
      .insert({
        obra_id: input.obra_id ?? null,
        proveedor_id: input.proveedor_id ?? null,
        concepto: input.concepto,
        fecha_necesidad: input.fecha_necesidad,
        fuente_legacy: input.fuente_legacy,
      })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as Compra, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

// Actualiza solo las columnas provistas de la compra — registra el avance de una
// etapa (solicitud, cotización, orden, recepción) sin tocar el resto del historial.
export async function actualizarCompra(
  supabase: SupabaseClient,
  id: string,
  input: ActualizarCompraInput
): Promise<ServiceResult<Compra>> {
  try {
    const cambios: Record<string, unknown> = {}
    if (input.fecha_solicitud !== undefined) cambios.fecha_solicitud = input.fecha_solicitud
    if (input.fecha_cotizacion !== undefined) cambios.fecha_cotizacion = input.fecha_cotizacion
    if (input.monto_cotizado !== undefined) cambios.monto_cotizado = input.monto_cotizado
    if (input.fecha_orden !== undefined) cambios.fecha_orden = input.fecha_orden
    if (input.monto_orden !== undefined) cambios.monto_orden = input.monto_orden
    if (input.referencia_orden !== undefined) cambios.referencia_orden = input.referencia_orden
    if (input.fecha_entrega_prevista !== undefined) cambios.fecha_entrega_prevista = input.fecha_entrega_prevista
    if (input.fecha_recepcion !== undefined) cambios.fecha_recepcion = input.fecha_recepcion
    if (input.monto_recibido !== undefined) cambios.monto_recibido = input.monto_recibido
    if (input.notas !== undefined) cambios.notas = input.notas

    if (Object.keys(cambios).length > 0) {
      const { error } = await supabase.from('compras').update(cambios).eq('id', id)
      if (error) return { data: null, error: error.message }
    }

    // Vincular un pago existente es una acción sobre movimientos_caja (la FK vive del
    // lado del pago, no de la compra — 1 compra puede tener N pagos vinculados).
    if (input.movimiento_caja_id_a_vincular) {
      const { error } = await supabase
        .from('movimientos_caja')
        .update({ compra_id: id })
        .eq('id', input.movimiento_caja_id_a_vincular)
      if (error) return { data: null, error: error.message }
    }

    const { data, error } = await supabase.from('compras').select('*').eq('id', id).single()
    if (error) return { data: null, error: error.message }
    return { data: data as Compra, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
