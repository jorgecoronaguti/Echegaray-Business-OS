// id de cliente → nombre para mostrar, leído de `cliente_rotulo` (el nombre de `clientes` sin CUIT,
// contacto ni notas: la tabla es sólo de Administración desde 20260926T0001) con el formato único.
import type { SupabaseClient } from '@supabase/supabase-js'
import { nombreDeCliente } from './nombre.ts'

/** Todos los clientes que la sesión ve (son pocos). Un error ⇒ Map vacío: quien llama cae en su texto. */
export async function nombresDeClientes(supabase: SupabaseClient): Promise<Map<string, string>> {
  try {
    const { data, error } = await supabase.from('cliente_rotulo').select('id, nombre_comercial, razon_social')
    if (error) return new Map()
    const m = new Map<string, string>()
    for (const c of (data ?? []) as { id: string; nombre_comercial: string | null; razon_social: string | null }[]) {
      const n = nombreDeCliente(c)
      if (n) m.set(c.id, n)
    }
    return m
  } catch {
    return new Map()
  }
}
