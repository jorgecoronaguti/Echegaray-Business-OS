import type { SupabaseClient } from '@supabase/supabase-js'
import type { CalendarioFinanciero } from '../types'

// Lee el snapshot más reciente del Calendario Financiero. El cálculo ya lo hizo el motor de
// Ingeniería Financiera (el worker lo materializó): acá SÓLO se lee. Nunca se toca el Sheet ni se
// recalcula un número.
export async function getCalendarioFinanciero(
  supabase: SupabaseClient,
): Promise<{ data?: CalendarioFinanciero; error?: string; generadoEn?: string }> {
  const { data, error } = await supabase
    .from('finanzas_calendario')
    .select('payload, generado_en')
    .order('generado_en', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Todavía no hay un calendario generado. Corré sync-calendario-financiero.' }
  return { data: data.payload as CalendarioFinanciero, generadoEn: data.generado_en as string }
}
