// CUIT → nombre del maestro de proveedores, con el formato único (src/shared/proveedores/nombre.ts).
import type { SupabaseClient } from '@supabase/supabase-js'
import { claveCuit, nombreDeProveedor } from './nombre.ts'

/** Un error ⇒ Map vacío: la pantalla cae en el texto del papel, nunca se cae. */
export async function proveedoresPorCuit(supabase: SupabaseClient): Promise<Map<string, string>> {
  try {
    const { data, error } = await supabase.from('proveedores').select('cuit, nombre, razon_social').not('cuit', 'is', null)
    if (error) return new Map()
    const m = new Map<string, string>()
    for (const p of (data ?? []) as { cuit: string | null; nombre: string | null; razon_social: string | null }[]) {
      const k = claveCuit(p.cuit)
      const n = nombreDeProveedor(p)
      if (k && n) m.set(k, n)
    }
    return m
  } catch {
    return new Map()
  }
}
