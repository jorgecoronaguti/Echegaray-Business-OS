import { z } from 'zod'

// Registro HH — consumo real de horas hombre por obra, a granularidad SEMANAL (la
// unidad real que usa JORNALES hoy, confirmado por verificación puntual — PRP-008).
// trabajador_o_cuadrilla es texto libre: JORNALES identifica al trabajador por nombre,
// no por legajo, y no existe forma confiable de cruzarlo con otra fuente (ALTAS-BAJAS
// usa legajo). No se fabrica una relación que la fuente no sostiene.
// Columnas en snake_case, igual que la tabla en Supabase.
// Ver supabase/migrations/20260707114348_hh_productividad_obra.sql

export interface RegistroHH {
  id: string
  obra_id: string
  trabajador_o_cuadrilla: string
  categoria: 'oficial_especializado' | 'oficial' | 'medio_oficial' | 'ayudante' | null
  fecha_inicio_semana: string
  horas: number
  costo_real_id: string | null
  fuente_legacy: string
  notas: string | null
  created_at: string
  updated_at: string
}

export const registroHHInputSchema = z.object({
  obra_id: z.string().uuid('Obra inválida'),
  trabajador_o_cuadrilla: z.string().trim().min(1, 'Indicá el trabajador o la cuadrilla'),
  categoria: z.enum(['oficial_especializado', 'oficial', 'medio_oficial', 'ayudante']).optional(),
  fecha_inicio_semana: z.string().min(1, 'La semana es obligatoria'),
  horas: z.coerce.number().positive('Las horas deben ser mayores a 0'),
  costo_real_id: z.string().uuid('Costo real inválido').optional(),
  fuente_legacy: z.string().trim().min(1, 'Indicá de qué fuente viene (ej. JORNALES)'),
  notas: z.string().trim().min(1).optional(),
})
export type RegistroHHInput = z.infer<typeof registroHHInputSchema>

// Fila de la vista obra_hh_resumen — HH estimada (del presupuesto aprobado) vs HH
// real acumulada, por obra.
export interface ObraHHResumen {
  obra_id: string
  obra_nombre: string
  obra_estado: string
  hh_estimada: number | null
  hh_real_acumulada: number
  cantidad_semanas_registradas: number
  ultima_fecha_registro: string | null
  desvio_absoluto: number | null
  desvio_porcentual: number | null
}

export type TipoAlertaHH =
  | 'sin_estimacion'
  | 'desvio_significativo'
  | 'concentracion_anormal'
  | 'obra_activa_sin_registro_reciente'
  | 'informacion_insuficiente'

export interface AlertaHH {
  tipo: TipoAlertaHH
  mensaje: string
}

// Umbrales propuestos, no validados todavía con el usuario — misma lógica que
// Control Económico (PRP-005): decisión de negocio abierta, ajustable sin migración.
export const UMBRAL_DESVIO_HH_PORCENTAJE = 15
export const UMBRAL_CONCENTRACION_MULTIPLICADOR = 1.5
export const DIAS_SIN_REGISTRO_RECIENTE = 14
export const MINIMO_SEMANAS_PARA_TENDENCIA = 3

// Agrupa los registros por semana para mostrar la evolución del consumo de HH
// durante la ejecución — responde "¿cómo evolucionó el consumo de HH?" sin
// necesitar un gráfico.
export function agruparHHPorSemana(registros: RegistroHH[]): { semana: string; horas: number }[] {
  const totales = new Map<string, number>()
  for (const r of registros) {
    totales.set(r.fecha_inicio_semana, (totales.get(r.fecha_inicio_semana) ?? 0) + r.horas)
  }
  return Array.from(totales.entries())
    .map(([semana, horas]) => ({ semana, horas }))
    .sort((a, b) => a.semana.localeCompare(b.semana))
}

// Deriva las alertas de decisión de HH para una obra. No inventa umbrales de
// producción física ni relaciona HH con avance (esa fuente no existe todavía en el
// OS) — solo compara contra HH estimada, tendencia temporal propia de la obra, y
// actividad reciente.
export function calcularAlertasObraHH(
  resumen: ObraHHResumen,
  registros: RegistroHH[],
  hoy: Date = new Date()
): AlertaHH[] {
  const alertas: AlertaHH[] = []

  if (resumen.hh_estimada === null) {
    alertas.push({ tipo: 'sin_estimacion', mensaje: 'Obra sin HH estimadas disponibles para comparar' })
  } else if (resumen.desvio_porcentual !== null && resumen.desvio_porcentual > UMBRAL_DESVIO_HH_PORCENTAJE) {
    alertas.push({
      tipo: 'desvio_significativo',
      mensaje: `Consumo de HH ${resumen.desvio_porcentual}% por encima de lo estimado`,
    })
  }

  if (resumen.obra_estado === 'activa') {
    const sinRegistroReciente =
      !resumen.ultima_fecha_registro ||
      (hoy.getTime() - new Date(resumen.ultima_fecha_registro).getTime()) / (1000 * 60 * 60 * 24) >
        DIAS_SIN_REGISTRO_RECIENTE
    if (sinRegistroReciente) {
      alertas.push({ tipo: 'obra_activa_sin_registro_reciente', mensaje: 'Obra activa sin registro reciente de HH' })
    }
  }

  if (resumen.cantidad_semanas_registradas < MINIMO_SEMANAS_PARA_TENDENCIA) {
    alertas.push({
      tipo: 'informacion_insuficiente',
      mensaje: 'Todavía no hay suficientes semanas registradas para calcular productividad de forma confiable',
    })
  } else {
    const semanas = agruparHHPorSemana(registros)
    const promedio = semanas.reduce((acc, s) => acc + s.horas, 0) / semanas.length
    const semanaAnormal = semanas.find((s) => s.horas > promedio * UMBRAL_CONCENTRACION_MULTIPLICADOR)
    if (semanaAnormal) {
      alertas.push({
        tipo: 'concentracion_anormal',
        mensaje: `Semana del ${semanaAnormal.semana} concentra ${semanaAnormal.horas}hs, muy por encima del promedio (${promedio.toFixed(1)}hs)`,
      })
    }
  }

  return alertas
}
