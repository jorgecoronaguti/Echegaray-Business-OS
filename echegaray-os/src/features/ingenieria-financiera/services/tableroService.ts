import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ModeloLiquidezVigente,
  CondicionesVigentes,
  CompararFinanciamientoVigente,
  PriorizarPagosVigente,
} from '../types/tablero'

// Lee las salidas del motor de Ingeniería Financiera que los syncs materializaron en las tablas
// singleton public.finanzas_*. Acá SÓLO se lee: la Web nunca recalcula un peso ni llama al orquestador.
// Cada número que aparece en pantalla salió de una tabla que un sync escribió desde el tool del motor.

/** El modelo único de liquidez vigente (disponible, comprometido, líneas, colchón) + recomendaciones. */
export async function getModeloLiquidez(
  supabase: SupabaseClient,
): Promise<{ data?: ModeloLiquidezVigente; error?: string }> {
  const { data, error } = await supabase
    .from('finanzas_modelo_liquidez')
    .select('modelo, recomendaciones, calculado_en')
    .eq('id', 1)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Todavía no hay un modelo de liquidez calculado.' }
  return { data: data as ModeloLiquidezVigente }
}

/** Las condiciones de financiamiento vigentes (tasas/límites con fuente) + lo que falta cargar. */
export async function getCondicionesFinancieras(
  supabase: SupabaseClient,
): Promise<{ data?: CondicionesVigentes; error?: string }> {
  const { data, error } = await supabase
    .from('finanzas_condiciones_vigentes')
    .select('condiciones, calculado_en')
    .eq('id', 1)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Todavía no hay condiciones de financiamiento calculadas.' }
  return { data: data as CondicionesVigentes }
}

/** El comparador de financiamiento sobre el escenario real derivado de la posición del día. */
export async function getCompararFinanciamiento(
  supabase: SupabaseClient,
): Promise<{ data?: CompararFinanciamientoVigente; error?: string }> {
  const { data, error } = await supabase
    .from('finanzas_comparar_financiamiento')
    .select('comparacion, calculado_en')
    .eq('id', 1)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Todavía no hay una comparación de financiamiento calculada.' }
  return { data: data as CompararFinanciamientoVigente }
}

/** La priorización de pagos sobre los egresos reales de los próximos 30 días. */
export async function getPriorizarPagos(
  supabase: SupabaseClient,
): Promise<{ data?: PriorizarPagosVigente; error?: string }> {
  const { data, error } = await supabase
    .from('finanzas_priorizar_pagos')
    .select('priorizacion, calculado_en')
    .eq('id', 1)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Todavía no hay una priorización de pagos calculada.' }
  return { data: data as PriorizarPagosVigente }
}
