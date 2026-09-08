// LA LECTURA DEL CATÁLOGO DE OBRAS DE UNA PERSONA. Ni una regla acá: qué significa cada estado y
// cómo se rotula cada obra lo decide `obrasDePersona.ts`, que se prueba sin base.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DatosDeObra } from './obrasDePersona.ts'

/**
 * Nombre, cliente y estado de las obras donde esta persona tiene horas.
 *
 * SIN FILTRAR POR ESTADO, a propósito: el historial de una persona son sus obras, y la mitad ya
 * cerraron. La lista de ids sale de sus propios registros, así que son pocas y la consulta no
 * crece con el tamaño de la empresa.
 */
export async function getObrasDeLosRegistros(
  supabase: SupabaseClient,
  ids: (string | null)[],
): Promise<Record<string, DatosDeObra>> {
  const unicos = [...new Set(ids.filter(Boolean))] as string[]
  if (unicos.length === 0) return {}
  const { data } = await supabase
    .from('obra_canonica').select('id, nombre, cliente_texto, estado').in('id', unicos)
  const mapa: Record<string, DatosDeObra> = {}
  for (const o of (data ?? []) as {
    id: string; nombre: string | null; cliente_texto: string | null; estado: string | null
  }[]) {
    mapa[o.id] = { nombre: o.nombre, cliente: o.cliente_texto, estado: o.estado }
  }
  return mapa
}
