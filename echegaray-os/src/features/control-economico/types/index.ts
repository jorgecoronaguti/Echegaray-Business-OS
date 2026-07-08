// Resumen económico de una Obra — capa de lectura sobre la vista `obra_resumen_economico`
// (PRP-005). No es una entidad con inserts propios: se deriva de obras + presupuestos
// (solo el aprobado) + costos_reales. Columnas en snake_case, igual que la vista.
// Ver supabase/migrations/20260706200918_control_economico_obra_resumen.sql

export interface ObraResumenEconomico {
  obra_id: string
  obra_nombre: string
  monto_contratado: number

  presupuesto_id: string | null
  presupuesto_version: number | null
  monto_presupuestado: number | null
  costo_presupuestado: number | null
  margen_esperado: number | null
  presupuesto_fuente_legacy: string | null

  costo_real_acumulado: number
  costo_comprometido: number
  costo_pendiente: number
  costo_pagado: number

  desvio_absoluto: number | null
  desvio_porcentual: number | null
  margen_actualizado: number | null
}

export type EstadoEconomico = 'sin_presupuesto_aprobado' | 'sano' | 'atencion' | 'critico'

// Umbrales propuestos, no validados todavía con el usuario — es una decisión de
// negocio abierta (CLAUDE.md raíz: "si no existe respuesta, decirlo explícitamente").
// Fáciles de ajustar acá sin tocar la vista SQL ni el resto del servicio.
export const UMBRAL_DESVIO_ATENCION = 5
export const UMBRAL_DESVIO_CRITICO = 15

export function calcularEstadoEconomico(resumen: ObraResumenEconomico): EstadoEconomico {
  if (!resumen.presupuesto_id || resumen.desvio_porcentual === null) return 'sin_presupuesto_aprobado'
  const desvio = resumen.desvio_porcentual
  if (desvio <= UMBRAL_DESVIO_ATENCION) return 'sano'
  if (desvio <= UMBRAL_DESVIO_CRITICO) return 'atencion'
  return 'critico'
}

// Elevado desde ResumenEconomicoObra.tsx (UX-2) para reutilizar en el tablero de
// /obras y en la home de Dirección sin duplicar el mapeo.
export const ESTADO_ECONOMICO_LABEL: Record<EstadoEconomico, string> = {
  sin_presupuesto_aprobado: 'Sin presupuesto aprobado',
  sano: 'Sano',
  atencion: 'Atención',
  critico: 'Crítico',
}

export const ESTADO_ECONOMICO_CLASSNAME: Record<EstadoEconomico, string> = {
  sin_presupuesto_aprobado: 'bg-gray-100 text-gray-700',
  sano: 'bg-green-100 text-green-800',
  atencion: 'bg-amber-100 text-amber-800',
  critico: 'bg-red-100 text-red-800',
}
