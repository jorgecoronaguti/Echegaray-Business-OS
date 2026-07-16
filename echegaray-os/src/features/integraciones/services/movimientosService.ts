import type { SupabaseClient } from '@supabase/supabase-js'

export interface MovimientoConHerramienta {
  id_movimiento: string
  id_herramienta: string
  destino: string | null
  responsable: string | null
  fecha: string | null
  herramienta_nombre: string | null
}

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

// Log de movimientos con el nombre de la herramienta. Se resuelve el nombre con una segunda
// query (sin depender de un FK/embed de PostgREST, que fallaría si hay movimientos de
// herramientas ya borradas). Más recientes primero.
export async function getMovimientos(
  supabase: SupabaseClient,
  limit = 200,
): Promise<ServiceResult<MovimientoConHerramienta[]>> {
  try {
    const { data, error } = await supabase
      .from('movimientos_herramienta')
      .select('id_movimiento, id_herramienta, destino, responsable, fecha')
      .order('fecha', { ascending: false, nullsFirst: false })
      .limit(limit)
    if (error) return { data: null, error: error.message }
    const movs = data ?? []

    const ids = [...new Set(movs.map((m) => m.id_herramienta as string).filter(Boolean))]
    const nombres = new Map<string, string | null>()
    if (ids.length) {
      const { data: hs } = await supabase.from('herramientas').select('id_herramienta, nombre').in('id_herramienta', ids)
      for (const h of hs ?? []) nombres.set(h.id_herramienta as string, (h.nombre as string) ?? null)
    }

    const rows: MovimientoConHerramienta[] = movs.map((m) => ({
      id_movimiento: m.id_movimiento as string,
      id_herramienta: m.id_herramienta as string,
      destino: m.destino as string | null,
      responsable: m.responsable as string | null,
      fecha: m.fecha as string | null,
      herramienta_nombre: nombres.get(m.id_herramienta as string) ?? null,
    }))
    return { data: rows, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Error desconocido' }
  }
}
