// PERSONAS — la lectura del legajo para la pantalla de Administración.
//
// Es la ÚNICA capa del OS que lee `personas` entera. El resto del sistema (la obra, al asignar
// gente) lee la vista `persona_plantel`, que publica sólo nombre, categoría, especialidad y egreso.
// Ese corte no es de comodidad: `personas` tiene `retribucion_pactada`, `cuil`, `dni` y `obra_social`,
// y hasta el 19/08/2026 cualquier autenticado los leía por PostgREST con `using (true)`.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AsignacionDePersona, Persona, ServiceResult } from '../types'

const COLUMNAS = 'id, nombre_completo, dni, cuil, fecha_ingreso, fecha_egreso, categoria, especialidad, notas'

export type FiltroEstado = 'activas' | 'egresadas' | 'todas'

export interface FiltroPersonas {
  q?: string
  estado?: FiltroEstado
  categoria?: string
}

/**
 * El listado, ya filtrado por la base.
 *
 * La búsqueda va en el servidor y no en el cliente: filtrar 30 filas en el navegador funciona, pero
 * deja de funcionar en silencio el día que sean 300 y la pantalla muestre sólo la primera página.
 * Se busca por nombre, DNI y CUIL porque son las tres formas en que Administración identifica a
 * alguien cuando llega un papel.
 */
export async function getPersonas(
  supabase: SupabaseClient,
  filtro: FiltroPersonas = {},
): Promise<ServiceResult<Persona[]>> {
  let consulta = supabase.from('personas').select(COLUMNAS)

  const estado = filtro.estado ?? 'activas'
  if (estado === 'activas') consulta = consulta.is('fecha_egreso', null)
  if (estado === 'egresadas') consulta = consulta.not('fecha_egreso', 'is', null)

  if (filtro.categoria) consulta = consulta.eq('categoria', filtro.categoria)

  const q = filtro.q?.trim()
  if (q) {
    // Las comas separan condiciones en un `or` de PostgREST, así que un término con coma partiría
    // el filtro en dos y devolvería resultados de más. Se sacan antes de armar la expresión.
    const seguro = q.replace(/[,()]/g, ' ').trim()
    if (seguro) {
      consulta = consulta.or(
        `nombre_completo.ilike.%${seguro}%,dni.ilike.%${seguro}%,cuil.ilike.%${seguro}%`,
      )
    }
  }

  const { data, error } = await consulta.order('nombre_completo', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as Persona[], error: null }
}

export async function getPersona(supabase: SupabaseClient, id: string): Promise<ServiceResult<Persona | null>> {
  const { data, error } = await supabase.from('personas').select(COLUMNAS).eq('id', id).maybeSingle()
  if (error) return { data: null, error: error.message }
  return { data: (data as Persona) ?? null, error: null }
}

/**
 * Dónde está asignada una persona hoy.
 *
 * Se muestra para RESPONDER "¿dónde está?", no para editar: la asignación se hace desde la obra,
 * que es donde se ve contra qué actividad y con qué cuadrilla. Duplicar acá el alta daría dos
 * lugares para crear el mismo vínculo y ninguna razón para preferir uno.
 */
export async function getAsignacionesDe(
  supabase: SupabaseClient,
  personaId: string,
): Promise<ServiceResult<AsignacionDePersona[]>> {
  const { data, error } = await supabase
    .from('obra_asignacion')
    .select('id, obra_id, rol, cuadrilla, desde, hasta')
    .eq('persona_id', personaId)
    .order('desde', { ascending: false, nullsFirst: false })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as AsignacionDePersona[], error: null }
}

/** Cuántas asignaciones tiene cada persona, en una sola consulta para toda la tabla.
 *
 *  Una consulta por fila serían 30 idas a la base para pintar una columna. Se traen los vínculos
 *  de las personas listadas y se cuentan acá. */
export async function getConteoAsignaciones(
  supabase: SupabaseClient,
  personaIds: string[],
): Promise<Map<string, number>> {
  if (personaIds.length === 0) return new Map()
  const { data } = await supabase.from('obra_asignacion').select('persona_id').in('persona_id', personaIds)
  const m = new Map<string, number>()
  for (const fila of (data ?? []) as { persona_id: string }[]) {
    m.set(fila.persona_id, (m.get(fila.persona_id) ?? 0) + 1)
  }
  return m
}

/** Las categorías que de verdad hay cargadas, para poder filtrar por una que exista —incluidas las
 *  tres fuera de convenio, que si no serían invisibles y nadie las corregiría. */
export async function getCategoriasEnUso(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.from('personas').select('categoria').not('categoria', 'is', null)
  const set = new Set((data ?? []).map((f) => (f as { categoria: string }).categoria))
  return [...set].sort()
}
