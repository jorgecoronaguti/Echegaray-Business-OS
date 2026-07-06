import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Certificado,
  CertificadoInput,
  ActualizarCertificadoInput,
  ObraEjecucionFinanciera,
} from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getCertificadosPorObra(
  supabase: SupabaseClient,
  obraId: string
): Promise<ServiceResult<Certificado[]>> {
  try {
    const { data, error } = await supabase
      .from('certificados')
      .select('*')
      .eq('obra_id', obraId)
      .order('numero', { ascending: true })
    if (error) return { data: null, error: error.message }
    return { data: data as Certificado[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function getEjecucionFinancieraPorObra(
  supabase: SupabaseClient,
  obraId: string
): Promise<ServiceResult<ObraEjecucionFinanciera | null>> {
  try {
    const { data, error } = await supabase
      .from('obra_ejecucion_financiera')
      .select('*')
      .eq('obra_id', obraId)
      .maybeSingle()
    if (error) return { data: null, error: error.message }
    return { data: data as ObraEjecucionFinanciera | null, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function insertCertificado(
  supabase: SupabaseClient,
  input: CertificadoInput
): Promise<ServiceResult<Certificado>> {
  try {
    const { data, error } = await supabase
      .from('certificados')
      .insert({
        obra_id: input.obra_id,
        numero: input.numero,
        descripcion: input.descripcion ?? null,
        fecha_certificacion: input.fecha_certificacion,
        monto_certificado: input.monto_certificado,
      })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as Certificado, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

// Actualiza solo las columnas provistas — registra el avance de una etapa
// (facturación o cobranza) sin tocar el resto del historial ya cargado.
export async function actualizarCertificado(
  supabase: SupabaseClient,
  id: string,
  input: ActualizarCertificadoInput
): Promise<ServiceResult<Certificado>> {
  try {
    const cambios: Record<string, unknown> = {}
    if (input.fecha_facturacion !== undefined) cambios.fecha_facturacion = input.fecha_facturacion
    if (input.monto_facturado !== undefined) cambios.monto_facturado = input.monto_facturado
    if (input.referencia_factura !== undefined) cambios.referencia_factura = input.referencia_factura
    if (input.fecha_vencimiento !== undefined) cambios.fecha_vencimiento = input.fecha_vencimiento
    if (input.fecha_cobranza !== undefined) cambios.fecha_cobranza = input.fecha_cobranza
    if (input.monto_cobrado !== undefined) cambios.monto_cobrado = input.monto_cobrado
    if (input.movimiento_caja_id !== undefined) cambios.movimiento_caja_id = input.movimiento_caja_id
    if (input.notas !== undefined) cambios.notas = input.notas

    const { data, error } = await supabase.from('certificados').update(cambios).eq('id', id).select().single()
    if (error) return { data: null, error: error.message }
    return { data: data as Certificado, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
