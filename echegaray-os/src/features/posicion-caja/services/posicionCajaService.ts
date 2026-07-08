import type { SupabaseClient } from '@supabase/supabase-js'
import { getCuentasFinancieras } from '@/features/fundacion/services/fundacionService'
import { getMovimientosCaja } from '@/features/flujo-caja/services/movimientosCajaService'
import { getObligacionesResumen, getAplicacionesPago } from '@/features/obligaciones/services/obligacionesService'
import { calcularPosicionCajaConsolidada } from '../types'
import type { PosicionCajaConsolidada } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

// Orquesta la carga de las 4 fuentes que F1 necesita — mismas tablas/vistas que ya
// usan Caja Operativa (PRP-001) y Obligaciones (PRP-010), sin tabla ni vista nueva.
export async function getPosicionCajaConsolidada(
  supabase: SupabaseClient
): Promise<ServiceResult<PosicionCajaConsolidada>> {
  try {
    const [cuentas, movimientos, obligacionesResumen, aplicacionesPago] = await Promise.all([
      getCuentasFinancieras(supabase),
      getMovimientosCaja(supabase),
      getObligacionesResumen(supabase),
      getAplicacionesPago(supabase),
    ])

    const primerError = cuentas.error ?? movimientos.error ?? obligacionesResumen.error ?? aplicacionesPago.error
    if (primerError) return { data: null, error: primerError }

    const posicion = calcularPosicionCajaConsolidada({
      cuentas: cuentas.data ?? [],
      movimientos: movimientos.data ?? [],
      obligacionesResumen: obligacionesResumen.data ?? [],
      aplicacionesPago: aplicacionesPago.data ?? [],
    })

    return { data: posicion, error: null }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    return { data: null, error }
  }
}
