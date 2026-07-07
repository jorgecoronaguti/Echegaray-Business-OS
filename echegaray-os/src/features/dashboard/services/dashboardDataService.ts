import type { SupabaseClient } from '@supabase/supabase-js'
import type { DashboardDatosFuente } from '../types'
import { getObras } from '@/features/obras/services/obrasService'
import { getProveedores } from '@/features/fundacion/services/fundacionService'
import { getResumenEconomicoTodasLasObras } from '@/features/control-economico/services/controlEconomicoService'
import { getAdicionalesTodasLasObras } from '@/features/adicionales/services/adicionalesService'
import {
  getCertificadosTodasLasObras,
  getEjecucionFinancieraTodasLasObras,
} from '@/features/ejecucion-financiera/services/ejecucionFinancieraService'
import {
  getRegistrosHHTodasLasObras,
  getHHResumenTodasLasObras,
} from '@/features/hh-productividad/services/hhProductividadService'
import { getComprasTodasLasObras, getComprasResumenTodasLasObras } from '@/features/compras/services/comprasService'
import { getObligaciones, getObligacionesResumen } from '@/features/obligaciones/services/obligacionesService'
import { getMovimientosCaja } from '@/features/flujo-caja/services/movimientosCajaService'
import { UMBRAL_DIAS_PROXIMO_VENCIMIENTO } from '@/features/obligaciones/types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

// Orquesta la carga de todas las capacidades para el Dashboard de Dirección
// (PRP-011) — no ejecuta ningún cálculo de negocio, solo trae los datos ya
// existentes (mismas vistas y tablas de cada capacidad, sin duplicar nada).
export async function getDashboardDatosFuente(
  supabase: SupabaseClient
): Promise<ServiceResult<DashboardDatosFuente>> {
  try {
    const [
      obras,
      proveedores,
      resumenEconomico,
      adicionales,
      certificados,
      ejecucionFinanciera,
      registrosHH,
      resumenHH,
      compras,
      comprasResumen,
      obligaciones,
      obligacionesResumen,
      movimientos,
    ] = await Promise.all([
      getObras(supabase),
      getProveedores(supabase),
      getResumenEconomicoTodasLasObras(supabase),
      getAdicionalesTodasLasObras(supabase),
      getCertificadosTodasLasObras(supabase),
      getEjecucionFinancieraTodasLasObras(supabase),
      getRegistrosHHTodasLasObras(supabase),
      getHHResumenTodasLasObras(supabase),
      getComprasTodasLasObras(supabase),
      getComprasResumenTodasLasObras(supabase),
      getObligaciones(supabase),
      getObligacionesResumen(supabase),
      getMovimientosCaja(supabase),
    ])

    const primerError =
      obras.error ??
      proveedores.error ??
      resumenEconomico.error ??
      adicionales.error ??
      certificados.error ??
      ejecucionFinanciera.error ??
      registrosHH.error ??
      resumenHH.error ??
      compras.error ??
      comprasResumen.error ??
      obligaciones.error ??
      obligacionesResumen.error ??
      movimientos.error
    if (primerError) return { data: null, error: primerError }

    // Cobros proyectados en la misma ventana que usa la alerta de tensión de liquidez
    // (PRP-010) — se recalcula acá porque el Dashboard es quien conoce esa ventana
    // para el conjunto completo de movimientos, no una obra puntual.
    const hoy = new Date()
    const cobrosProyectadosEnVentana = (movimientos.data ?? [])
      .filter((m) => {
        if (m.tipo !== 'cobro' || m.estado !== 'proyectado') return false
        const dias = (new Date(m.fecha_esperada).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)
        return dias >= 0 && dias <= UMBRAL_DIAS_PROXIMO_VENCIMIENTO
      })
      .reduce((acc, m) => acc + m.monto, 0)

    return {
      data: {
        obras: obras.data ?? [],
        proveedores: proveedores.data ?? [],
        resumenEconomico: resumenEconomico.data ?? [],
        adicionales: adicionales.data ?? [],
        certificados: certificados.data ?? [],
        ejecucionFinanciera: ejecucionFinanciera.data ?? [],
        registrosHH: registrosHH.data ?? [],
        resumenHH: resumenHH.data ?? [],
        compras: compras.data ?? [],
        comprasResumen: comprasResumen.data ?? [],
        obligaciones: obligaciones.data ?? [],
        obligacionesResumen: obligacionesResumen.data ?? [],
        cobrosProyectadosEnVentana,
      },
      error: null,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    return { data: null, error }
  }
}
