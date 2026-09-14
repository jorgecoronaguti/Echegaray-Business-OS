// EL CÓDIGO DE CADA OBRA (`OB-0012`), leído aparte del resto de la fila.
//
// ═══ POR QUÉ UNA CONSULTA PROPIA Y NO UNA COLUMNA MÁS EN CADA `select` ═══
//
// La migración `20260915T0600_obra_codigo_interno` se aplica a mano y el deploy va por otro lado. Si
// `codigo` entrara en el `select` de la cartera, del jefe o del portal, un deploy que llegue antes que
// la migración haría fallar ESAS consultas enteras — PostgREST no ignora una columna que no existe —
// y las pantallas quedarían vacías. Leído aparte, lo peor que pasa es un Map vacío: el rótulo muestra
// el nombre solo hasta que la columna exista.

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * `Map<obra_id, codigo>`. `ids = null` trae las de todas las obras que el RLS deja ver: así una
 * pantalla que lista la cartera lo pide EN PARALELO con su consulta y no encadena un viaje más.
 * Ids vacíos ⇒ Map vacío y cero consultas. Error ⇒ Map vacío, nunca un código de relleno.
 */
export async function codigosDeObra(supabase: SupabaseClient, ids: (string | null | undefined)[] | null): Promise<Map<string, string>> {
  const unicos = ids == null ? null : [...new Set(ids.filter((id): id is string => !!id))]
  if (unicos && !unicos.length) return new Map()
  const consulta = supabase.from('obra_canonica').select('id, codigo')
  const { data, error } = await (unicos ? consulta.in('id', unicos) : consulta)
  if (error || !data) return new Map()
  const filas = data as unknown as { id: string; codigo: string | null }[]
  return new Map(filas.filter((f) => f.codigo).map((f) => [f.id, f.codigo as string]))
}
