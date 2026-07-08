import type { SupabaseClient } from '@supabase/supabase-js'
import { getClientes, getProveedores } from '@/features/fundacion/services/fundacionService'
import { getMovimientosCaja } from '@/features/flujo-caja/services/movimientosCajaService'
import { getObligacionesResumen, getAplicacionesPago } from '@/features/obligaciones/services/obligacionesService'
import { calcularCapitalTrabajo } from '@/features/capital-trabajo/types'
import type { CapitalTrabajo } from '@/features/capital-trabajo/types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

export async function getCapitalTrabajo(supabase: SupabaseClient): Promise<ServiceResult<CapitalTrabajo>> {
  const [clientes, proveedores, movimientos, obligacionesResumen, aplicacionesPago] = await Promise.all([
    getClientes(supabase),
    getProveedores(supabase),
    getMovimientosCaja(supabase),
    getObligacionesResumen(supabase),
    getAplicacionesPago(supabase),
  ])

  const error =
    clientes.error ?? proveedores.error ?? movimientos.error ?? obligacionesResumen.error ?? aplicacionesPago.error
  if (error) {
    return { data: null, error }
  }

  const capital = calcularCapitalTrabajo({
    clientes: clientes.data ?? [],
    proveedores: proveedores.data ?? [],
    movimientos: movimientos.data ?? [],
    obligacionesResumen: obligacionesResumen.data ?? [],
    aplicacionesPago: aplicacionesPago.data ?? [],
  })

  return { data: capital, error: null }
}
