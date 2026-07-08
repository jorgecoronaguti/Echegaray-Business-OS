import type { Obra } from './index'
import type { ObraResumenEconomico } from '@/features/control-economico/types'
import { calcularEstadoEconomico, type EstadoEconomico } from '@/features/control-economico/types'
import type { ObraHHResumen } from '@/features/hh-productividad/types'
import type { ObraEjecucionFinanciera } from '@/features/ejecucion-financiera/types'
import type { ActividadSemanal } from '@/features/actividades-semanales/types'

// UX-2: tablero de gestión de obras -- una sola fila por obra que responde "¿cuál
// miro primero?" sin abrir cada ficha. Compone datos que YA existen (obra_resumen_
// economico, obra_hh_resumen, obra_ejecucion_financiera, actividades_semanales) --
// cero SQL nuevo, cero cálculo duplicado. Se usa tanto en /obras (tablero completo)
// como en la home de Dirección (top obras en riesgo), para no calcular esto dos veces.
export interface ObraTablero {
  obra_id: string
  obra_nombre: string
  estado: Obra['estado']
  monto_contratado: number
  responsableReciente: string | null
  avanceFisicoPromedio: number | null
  hhEstimada: number | null
  hhReal: number
  desvioHHPorcentual: number | null
  costoPresupuestado: number | null
  costoRealAcumulado: number
  margenEsperado: number | null
  margenActualizado: number | null
  desvioPorcentual: number | null
  estadoEconomico: EstadoEconomico
  totalCertificado: number
  totalFacturado: number
  totalCobrado: number
  pendienteCobrar: number
}

export function construirTableroObras(
  obras: Obra[],
  resumenes: ObraResumenEconomico[],
  hhResumenes: ObraHHResumen[],
  ejecuciones: ObraEjecucionFinanciera[],
  actividades: ActividadSemanal[]
): ObraTablero[] {
  const resumenPorObra = new Map(resumenes.map((r) => [r.obra_id, r]))
  const hhPorObra = new Map(hhResumenes.map((h) => [h.obra_id, h]))
  const ejecucionPorObra = new Map(ejecuciones.map((e) => [e.obra_id, e]))

  return obras.map((obra) => {
    const resumen = resumenPorObra.get(obra.id) ?? null
    const hh = hhPorObra.get(obra.id) ?? null
    const ejecucion = ejecucionPorObra.get(obra.id) ?? null

    const actividadesObra = actividades.filter((a) => a.obra_id === obra.id)
    const cerradas = actividadesObra.filter((a) => a.avance_real != null)
    const avanceFisicoPromedio =
      cerradas.length > 0 ? cerradas.reduce((acc, a) => acc + (a.avance_real ?? 0), 0) / cerradas.length : null

    const masReciente = [...actividadesObra].sort((a, b) => (a.semana_inicio < b.semana_inicio ? 1 : -1))[0]

    return {
      obra_id: obra.id,
      obra_nombre: obra.nombre,
      estado: obra.estado,
      monto_contratado: obra.monto_contratado,
      responsableReciente: masReciente?.responsable ?? null,
      avanceFisicoPromedio,
      hhEstimada: hh?.hh_estimada ?? null,
      hhReal: hh?.hh_real_acumulada ?? 0,
      desvioHHPorcentual: hh?.desvio_porcentual ?? null,
      costoPresupuestado: resumen?.costo_presupuestado ?? null,
      costoRealAcumulado: resumen?.costo_real_acumulado ?? 0,
      margenEsperado: resumen?.margen_esperado ?? null,
      margenActualizado: resumen?.margen_actualizado ?? null,
      desvioPorcentual: resumen?.desvio_porcentual ?? null,
      estadoEconomico: resumen ? calcularEstadoEconomico(resumen) : 'sin_presupuesto_aprobado',
      totalCertificado: ejecucion?.total_certificado ?? 0,
      totalFacturado: ejecucion?.total_facturado ?? 0,
      totalCobrado: ejecucion?.total_cobrado ?? 0,
      pendienteCobrar: ejecucion?.pendiente_cobrar ?? 0,
    }
  })
}

// Activas primero, después por severidad económica (crítico antes que sano) -- "¿cuál
// miro primero?", no orden alfabético ni de creación.
const ORDEN_ESTADO: Record<Obra['estado'], number> = { activa: 0, contratada: 1, pausada: 2, cerrada: 3 }
const ORDEN_ECONOMICO: Record<EstadoEconomico, number> = {
  critico: 0,
  atencion: 1,
  sin_presupuesto_aprobado: 2,
  sano: 3,
}

export function ordenarTableroObras(tablero: ObraTablero[]): ObraTablero[] {
  return [...tablero].sort((a, b) => {
    const porEstado = ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado]
    if (porEstado !== 0) return porEstado
    return ORDEN_ECONOMICO[a.estadoEconomico] - ORDEN_ECONOMICO[b.estadoEconomico]
  })
}

export function obrasEnRiesgo(tablero: ObraTablero[]): ObraTablero[] {
  return tablero.filter((o) => o.estadoEconomico === 'critico' || o.estadoEconomico === 'atencion')
}
