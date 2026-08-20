// CONTRATO Y COBRANZA — el acceso a datos de los certificados de la obra.
//
// FRONTERA: los TOTALES de certificado, facturado, cobrado y pendiente los publica
// `obra_plan_vs_real`. Acá se traen las FILAS, que son el respaldo de esos totales — nunca su
// segunda versión. Si esta capa sumara, el día que una fila entre por otro camino habría dos
// respuestas para "cuánto se certificó".

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Certificado, ServiceResult } from '../types'

/**
 * Los certificados. SIN `obraId` devuelve los de todas las obras visibles — la misma consulta, con
 * un `where` menos: *"MISMA TABLA/FUENTE → vista global + filtro por obra"*.
 *
 * Quién los ve NO lo decide esta capa: `certificados_select` los reserva a Administración
 * (`20260818T2330_usuario_obra_y_rls_por_obra.sql`, *"Economía/administración sensible no
 * visible"*). Para el nivel Obras esta función devuelve una lista vacía porque la base no le manda
 * ninguna fila, no porque acá haya un `if`.
 */
export async function getCertificados(supabase: SupabaseClient, obraId?: string): Promise<ServiceResult<Certificado[]>> {
  const base = supabase
    .from('certificados')
    .select('id, obra_canonica_id, numero, descripcion, fecha_certificacion, monto_certificado, fecha_facturacion, monto_facturado, referencia_factura, fecha_cobranza, monto_cobrado, notas')
  const { data, error } = await (obraId ? base.eq('obra_canonica_id', obraId) : base)
    .order('fecha_certificacion', { ascending: false })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as Certificado[], error: null }
}
