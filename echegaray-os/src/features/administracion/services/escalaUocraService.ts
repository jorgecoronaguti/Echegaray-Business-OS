// LA LECTURA DE LA ESCALA UOCRA PARA LA TIRA DE LIQUIDACIÓN. La regla está en `escalaUocra.ts`.
//
// `uocra_escala` es la réplica de `_UOCRA_RAW` del Sheet (IMPORTHTML viva sobre la escala publicada); la lee
// `authenticated` con su policy. Zona A, la de San Juan. Sin tabla o con error, `null`: la tira dice «sin cargar».

import type { SupabaseClient } from '@supabase/supabase-js'
import { escalaVigente, type EscalaVigente, type FilaUocra } from './escalaUocra'

export async function escalaUocraVigente(supabase: SupabaseClient, hoy: string): Promise<EscalaVigente | null> {
  const r = await supabase.from('uocra_escala')
    .select('categoria, basico_hora, mensual, vigencia_desde, cct, fuente, cargado_en')
    .eq('zona', 'A').lte('vigencia_desde', hoy)
    .order('vigencia_desde', { ascending: false }).limit(40)
  if (r.error) return null
  return escalaVigente((r.data ?? []) as FilaUocra[], hoy)
}
