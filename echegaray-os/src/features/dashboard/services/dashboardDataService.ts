import type { SupabaseClient } from '@supabase/supabase-js'
import type { DashboardDatosFuente } from '../types'
import { getObras } from '@/features/obras/services/obrasService'
import { getClientes, getProveedores } from '@/features/fundacion/services/fundacionService'
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
import { getObligaciones, getObligacionesResumen, getAplicacionesPago } from '@/features/obligaciones/services/obligacionesService'
import { getMovimientosCaja } from '@/features/flujo-caja/services/movimientosCajaService'
import { UMBRAL_DIAS_PROXIMO_VENCIMIENTO } from '@/features/obligaciones/types'
import { getCuentasFinancieras } from '@/features/fundacion/services/fundacionService'
import { calcularPosicionCajaConsolidada, cobrosProyectadosEnVentana } from '@/features/posicion-caja/types'
import { calcularCapitalTrabajo } from '@/features/capital-trabajo/types'
import { getActividadesSemanalesTodasLasObras } from '@/features/actividades-semanales/services/actividadesSemanalesService'

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
      clientes,
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
      cuentas,
      aplicacionesPago,
      actividadesSemanales,
    ] = await Promise.all([
      getObras(supabase),
      getClientes(supabase),
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
      getCuentasFinancieras(supabase),
      getAplicacionesPago(supabase),
      getActividadesSemanalesTodasLasObras(supabase),
    ])

    const primerError =
      obras.error ??
      clientes.error ??
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
      movimientos.error ??
      cuentas.error ??
      aplicacionesPago.error ??
      actividadesSemanales.error
    if (primerError) return { data: null, error: primerError }

    // F1: posición de caja consolidada — reemplaza el cálculo de "cobros proyectados
    // en ventana" que antes vivía inline acá (ver features/posicion-caja).
    const posicionCaja = calcularPosicionCajaConsolidada({
      cuentas: cuentas.data ?? [],
      movimientos: movimientos.data ?? [],
      obligacionesResumen: obligacionesResumen.data ?? [],
      aplicacionesPago: aplicacionesPago.data ?? [],
    })
    const cobrosProyectados = cobrosProyectadosEnVentana(
      movimientos.data ?? [],
      UMBRAL_DIAS_PROXIMO_VENCIMIENTO
    )

    // F2 (primer incremento): capital de trabajo y exposición por cliente/proveedor —
    // ver features/capital-trabajo.
    const capitalTrabajo = calcularCapitalTrabajo({
      clientes: clientes.data ?? [],
      proveedores: proveedores.data ?? [],
      movimientos: movimientos.data ?? [],
      obligacionesResumen: obligacionesResumen.data ?? [],
      aplicacionesPago: aplicacionesPago.data ?? [],
    })

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
        cobrosProyectadosEnVentana: cobrosProyectados,
        posicionCaja,
        capitalTrabajo,
        actividadesSemanales: actividadesSemanales.data ?? [],
      },
      error: null,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    return { data: null, error }
  }
}
