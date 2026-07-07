import { z } from 'zod'
import type { ObraResumenEconomico } from '@/features/control-economico/types'
import { calcularEstadoEconomico } from '@/features/control-economico/types'
import type { ObraEjecucionFinanciera, Certificado } from '@/features/ejecucion-financiera/types'
import { calcularAlertasCertificado, calcularAlertasObraEjecucionFinanciera } from '@/features/ejecucion-financiera/types'
import type { ObraHHResumen, RegistroHH } from '@/features/hh-productividad/types'
import { calcularAlertasObraHH } from '@/features/hh-productividad/types'
import type { Adicional } from '@/features/adicionales/types'
import { calcularAlertasAdicional } from '@/features/adicionales/types'
import type { Compra, CompraResumen } from '@/features/compras/types'
import { calcularAlertasCompra, calcularAlertasObraCompras } from '@/features/compras/types'
import type { ObligacionResumen } from '@/features/obligaciones/types'
import { calcularAlertasObligacion } from '@/features/obligaciones/types'

// Post Mortem — el cierre inteligente de una obra (PRP-012). No duplica ningún
// cálculo: mientras está en 'borrador', todos los resúmenes se leen en vivo de las
// vistas ya existentes (Control Económico, Ejecución Financiera, HH, Adicionales,
// Compras, Obligaciones). Lo único que esta tabla agrega es la capa de juicio humano
// (causas, aprendizajes, acciones, cambios sugeridos) y, al CERRAR, un snapshot
// congelado — para que el aprendizaje quede estable aunque después se corrija un
// dato de la obra ya cerrada.
// Columnas en snake_case, igual que la tabla en Supabase.
// Ver supabase/migrations/20260707125016_post_mortem_obra.sql

export interface ResumenSnapshotPostMortem {
  margenEsperado: number | null
  margenReal: number | null
  desvioCostoAbsoluto: number | null
  desvioCostoPorcentual: number | null
  desvioHHAbsoluto: number | null
  desvioHHPorcentual: number | null
  totalAdicionalesDetectados: number
  totalAdicionalesCobrados: number
  totalAdicionalesNoCobrados: number
  totalCertificado: number | null
  totalFacturado: number | null
  totalCobrado: number | null
  porcentajeContratoCobrado: number | null
  cantidadAlertasAlCierre: number
}

export interface PostMortem {
  id: string
  obra_id: string
  estado: 'borrador' | 'cerrado'
  causas_desvio: string | null
  aprendizajes: string | null
  acciones_recomendadas: string | null
  cambios_sugeridos_cotizacion: string | null
  resumen_snapshot: ResumenSnapshotPostMortem | null
  fecha_cierre: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

export const postMortemInputSchema = z.object({
  obra_id: z.string().uuid('Obra inválida'),
})
export type PostMortemInput = z.infer<typeof postMortemInputSchema>

// Guardar como borrador: solo la capa de juicio humano, en cualquier momento.
export const actualizarPostMortemInputSchema = z.object({
  causas_desvio: z.string().trim().min(1).optional(),
  aprendizajes: z.string().trim().min(1).optional(),
  acciones_recomendadas: z.string().trim().min(1).optional(),
  cambios_sugeridos_cotizacion: z.string().trim().min(1).optional(),
  notas: z.string().trim().min(1).optional(),
})
export type ActualizarPostMortemInput = z.infer<typeof actualizarPostMortemInputSchema>

export interface DatosParaSnapshotPostMortem {
  resumenEconomico: ObraResumenEconomico | null
  ejecucionFinanciera: ObraEjecucionFinanciera | null
  resumenHH: ObraHHResumen | null
  registrosHH: RegistroHH[]
  adicionales: Adicional[]
  certificados: Certificado[]
  compras: Compra[]
  comprasResumen: CompraResumen[]
  obligacionesResumen: ObligacionResumen[]
}

// Cuenta cuántas alertas tuvo/tiene esta obra, reutilizando exactamente las mismas
// funciones que ya usa cada capacidad y el Dashboard (PRP-011) — no hay un historial
// de alertas persistido (ninguna capacidad lo guarda), así que esto refleja el estado
// más reciente conocido, no un log completo de la ejecución. Documentado como límite
// en el PRP, no oculto.
function contarAlertasHistoricasObra(datos: DatosParaSnapshotPostMortem): number {
  let total = 0

  if (datos.resumenEconomico && calcularEstadoEconomico(datos.resumenEconomico) !== 'sano') total += 1

  for (const a of datos.adicionales) total += calcularAlertasAdicional(a).length

  for (const c of datos.certificados) total += calcularAlertasCertificado(c).length
  if (datos.ejecucionFinanciera) total += calcularAlertasObraEjecucionFinanciera(datos.ejecucionFinanciera).length

  if (datos.resumenHH) total += calcularAlertasObraHH(datos.resumenHH, datos.registrosHH).length

  for (const c of datos.compras) {
    const resumen = datos.comprasResumen.find((r) => r.compra_id === c.id)
    if (resumen) total += calcularAlertasCompra(c, resumen).length
  }
  total += calcularAlertasObraCompras(datos.compras).length

  for (const r of datos.obligacionesResumen) total += calcularAlertasObligacion(r).length

  return total
}

// Reutiliza los mismos cálculos ya existentes de cada capacidad — no recalcula nada,
// solo arma un objeto congelable con lo que cada vista/servicio ya devuelve. Los
// campos null se mantienen null (dato insuficiente), nunca se completan con un valor
// inventado.
export function construirResumenSnapshot(datos: DatosParaSnapshotPostMortem): ResumenSnapshotPostMortem {
  const totalAdicionalesDetectados = datos.adicionales.length
  const totalAdicionalesCobrados = datos.adicionales.filter((a) => a.fecha_cobranza !== null).length

  return {
    margenEsperado: datos.resumenEconomico?.margen_esperado ?? null,
    margenReal: datos.resumenEconomico?.margen_actualizado ?? null,
    desvioCostoAbsoluto: datos.resumenEconomico?.desvio_absoluto ?? null,
    desvioCostoPorcentual: datos.resumenEconomico?.desvio_porcentual ?? null,
    desvioHHAbsoluto: datos.resumenHH?.desvio_absoluto ?? null,
    desvioHHPorcentual: datos.resumenHH?.desvio_porcentual ?? null,
    totalAdicionalesDetectados,
    totalAdicionalesCobrados,
    totalAdicionalesNoCobrados: totalAdicionalesDetectados - totalAdicionalesCobrados,
    totalCertificado: datos.ejecucionFinanciera?.total_certificado ?? null,
    totalFacturado: datos.ejecucionFinanciera?.total_facturado ?? null,
    totalCobrado: datos.ejecucionFinanciera?.total_cobrado ?? null,
    porcentajeContratoCobrado: datos.ejecucionFinanciera?.porcentaje_contrato_cobrado ?? null,
    cantidadAlertasAlCierre: contarAlertasHistoricasObra(datos),
  }
}
