import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClasificacionCostoObra } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getClasificacionesPendientes(
  supabase: SupabaseClient
): Promise<ServiceResult<ClasificacionCostoObra[]>> {
  try {
    const { data, error } = await supabase
      .from('clasificaciones_costo_obra')
      .select('*')
      .eq('estado', 'pendiente')
      .order('monto', { ascending: false })
    if (error) return { data: null, error: error.message }
    return { data: data as ClasificacionCostoObra[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function getClasificacionesConfirmadas(
  supabase: SupabaseClient
): Promise<ServiceResult<ClasificacionCostoObra[]>> {
  try {
    const { data, error } = await supabase
      .from('clasificaciones_costo_obra')
      .select('*')
      .eq('estado', 'confirmado')
    if (error) return { data: null, error: error.message }
    return { data: data as ClasificacionCostoObra[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

// Confirmar = materializar en costos_reales (Control Económico ya sabe leerla) +
// marcar la clasificación como resuelta, en una sola operación -- nunca queda un
// costo real "flotando" sin que su origen en la cola quede trazado.
export async function confirmarClasificacion(
  supabase: SupabaseClient,
  clasificacionId: string,
  obraId: string
): Promise<ServiceResult<{ costoRealId: string }>> {
  try {
    const { data: clasificacion, error: errLectura } = await supabase
      .from('clasificaciones_costo_obra')
      .select('*')
      .eq('id', clasificacionId)
      .single()
    if (errLectura) return { data: null, error: errLectura.message }

    const { data: costoReal, error: errInsert } = await supabase
      .from('costos_reales')
      .insert({
        obra_id: obraId,
        proveedor_id: clasificacion.proveedor_id,
        concepto: clasificacion.concepto,
        monto: clasificacion.monto,
        fecha: clasificacion.fecha,
        estado: 'pagado',
        fuente_legacy: clasificacion.fuente_legacy,
        notas: `Clasificado manualmente desde la cola de clasificación de costo por obra (regla sugerida: ${clasificacion.regla_aplicada}).`,
      })
      .select('id')
      .single()
    if (errInsert) return { data: null, error: errInsert.message }

    const { error: errUpdate } = await supabase
      .from('clasificaciones_costo_obra')
      .update({ estado: 'confirmado', obra_confirmada_id: obraId, costo_real_id: costoReal.id })
      .eq('id', clasificacionId)
    if (errUpdate) return { data: null, error: errUpdate.message }

    return { data: { costoRealId: costoReal.id }, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function marcarSinObraAplicable(
  supabase: SupabaseClient,
  clasificacionId: string
): Promise<ServiceResult<null>> {
  try {
    const { error } = await supabase
      .from('clasificaciones_costo_obra')
      .update({ estado: 'sin_obra_aplicable' })
      .eq('id', clasificacionId)
    if (error) return { data: null, error: error.message }
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
