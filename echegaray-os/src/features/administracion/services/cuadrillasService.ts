// CUADRILLAS — la lectura.
//
// La cuadrilla NO guarda a qué obra va: eso se deriva de las asignaciones vigentes de sus
// integrantes. La vista `cuadrilla_panel` hace esa derivación y es la única que la hace.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Cuadrilla, Integrante, ServiceResult } from '../types'

export async function getCuadrillas(
  supabase: SupabaseClient,
  incluirInactivas = false,
): Promise<ServiceResult<Cuadrilla[]>> {
  let consulta = supabase.from('cuadrilla_panel').select('*')
  if (!incluirInactivas) consulta = consulta.eq('activa', true)
  const { data, error } = await consulta.order('nombre', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as Cuadrilla[], error: null }
}

/**
 * Los integrantes de una cuadrilla. Por defecto los VIGENTES; con `historial` también los que ya
 * salieron, que es lo que responde "¿quién estaba en esta cuadrilla en marzo?".
 *
 * El nombre se resuelve contra `persona_plantel` en una segunda consulta y no con un embed: el
 * plantel es una VISTA, y PostgREST sólo sabe embeber por una clave foránea declarada. Un embed
 * contra la vista compilaría y devolvería `null` para todo el mundo — el modo de falla más caro,
 * porque un nombre vacío parece un dato.
 */
export async function getIntegrantes(
  supabase: SupabaseClient,
  cuadrillaId: string,
  historial = false,
): Promise<ServiceResult<Integrante[]>> {
  let consulta = supabase
    .from('cuadrilla_integrante').select('id, persona_id, desde, hasta').eq('cuadrilla_id', cuadrillaId)
  if (!historial) consulta = consulta.is('hasta', null)
  const { data, error } = await consulta.order('desde', { ascending: false })
  if (error) return { data: null, error: error.message }

  const filas = (data ?? []) as { id: string; persona_id: string; desde: string; hasta: string | null }[]
  const ids = [...new Set(filas.map((f) => f.persona_id))]
  const nombres = new Map<string, string>()
  if (ids.length > 0) {
    const { data: personas } = await supabase.from('persona_plantel').select('id, nombre_completo').in('id', ids)
    for (const p of (personas ?? []) as { id: string; nombre_completo: string }[]) {
      nombres.set(p.id, p.nombre_completo)
    }
  }
  return {
    data: filas.map((f) => ({ ...f, nombre_completo: nombres.get(f.persona_id) ?? null })),
    error: null,
  }
}

/** La cuadrilla vigente de cada persona, para el selector de la ficha. */
export async function getCuadrillaDe(
  supabase: SupabaseClient,
  personaId: string,
): Promise<{ cuadrilla_id: string; desde: string } | null> {
  const { data } = await supabase
    .from('cuadrilla_integrante').select('cuadrilla_id, desde')
    .eq('persona_id', personaId).is('hasta', null).maybeSingle()
  return (data as { cuadrilla_id: string; desde: string } | null) ?? null
}
