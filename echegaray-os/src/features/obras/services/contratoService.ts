// CONTRATO Y COBRANZA — el acceso a datos de los certificados de la obra.
//
// FRONTERA: los TOTALES de certificado, facturado, cobrado y pendiente los publica
// `obra_plan_vs_real`. Acá se traen las FILAS, que son el respaldo de esos totales — nunca su
// segunda versión. Si esta capa sumara, el día que una fila entre por otro camino habría dos
// respuestas para "cuánto se certificó".

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Certificado, ServiceResult } from '../types'

export async function getCertificados(supabase: SupabaseClient, obraId: string): Promise<ServiceResult<Certificado[]>> {
  const { data, error } = await supabase
    .from('certificados')
    .select('id, obra_canonica_id, numero, descripcion, fecha_certificacion, monto_certificado, fecha_facturacion, monto_facturado, referencia_factura, fecha_cobranza, monto_cobrado, notas')
    .eq('obra_canonica_id', obraId)
    .order('fecha_certificacion', { ascending: false })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as Certificado[], error: null }
}
