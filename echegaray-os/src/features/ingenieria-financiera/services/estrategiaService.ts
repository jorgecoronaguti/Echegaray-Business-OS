import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstrategiaVigente } from '../types/estrategia'

// Lee la Estrategia Financiera vigente que el motor de Ingeniería Financiera ya ensambló y el sync
// materializó en public.finanzas_estrategia_vigente. Acá SÓLO se lee: la Web nunca recalcula una
// estrategia ni inventa un dato. Si el documento viene con estado 'sin dato', la Web lo declara.

/** El documento estratégico vigente (la estrategia que el OS está ejecutando) + cuándo se calculó. */
export async function getEstrategiaFinanciera(
  supabase: SupabaseClient,
): Promise<{ data?: EstrategiaVigente; error?: string }> {
  const { data, error } = await supabase
    .from('finanzas_estrategia_vigente')
    .select('estrategia, calculado_en')
    .eq('id', 1)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Todavía no hay una estrategia financiera calculada.' }
  return { data: data as EstrategiaVigente }
}
