// id de persona → nombre para mostrar, para las pantallas que reciben de una vista sólo el legajo como
// texto (efectivo: `efectivo_entrega_saldo.persona`) y el id. La vista no se toca: su `persona` también
// la lee la pestaña _EFECTIVO_RAW del Sheet, y un cambio ahí cambiaría el Sheet.
import type { SupabaseClient } from '@supabase/supabase-js'
import { nombreDePersonaONull } from './nombre.ts'

/** Las personas que la sesión puede ver (la RLS de `personas` decide). Un error ⇒ Map vacío. */
export async function nombresDePersonas(supabase: SupabaseClient, ids?: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  try {
    const unicos = ids ? [...new Set(ids.filter((x): x is string => Boolean(x)))] : null
    if (unicos && !unicos.length) return new Map()
    const base = supabase.from('personas').select('id, nombre_completo, nombre_para_mostrar')
    const { data, error } = await (unicos ? base.in('id', unicos) : base)
    if (error) return new Map()
    const m = new Map<string, string>()
    for (const p of (data ?? []) as { id: string; nombre_completo: string | null; nombre_para_mostrar: string | null }[]) {
      const n = nombreDePersonaONull(p)
      if (n) m.set(p.id, n)
    }
    return m
  } catch {
    return new Map()
  }
}
