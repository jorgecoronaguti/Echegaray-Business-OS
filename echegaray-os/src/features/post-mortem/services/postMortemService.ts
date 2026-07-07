import type { SupabaseClient } from '@supabase/supabase-js'
import type { PostMortem, PostMortemInput, ActualizarPostMortemInput, ResumenSnapshotPostMortem } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getPostMortemPorObra(
  supabase: SupabaseClient,
  obraId: string
): Promise<ServiceResult<PostMortem | null>> {
  try {
    const { data, error } = await supabase.from('post_mortems').select('*').eq('obra_id', obraId).maybeSingle()
    if (error) return { data: null, error: error.message }
    return { data: data as PostMortem | null, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

// Variante sin filtro por obra, para el área Comercial/Presupuestación (Fase II) —
// muestra los "cambios sugeridos para la próxima cotización" ya capturados en
// cualquier obra cerrada, sin recalcular nada.
export async function getPostMortemsTodasLasObras(supabase: SupabaseClient): Promise<ServiceResult<PostMortem[]>> {
  try {
    const { data, error } = await supabase
      .from('post_mortems')
      .select('*')
      .order('fecha_cierre', { ascending: false })
    if (error) return { data: null, error: error.message }
    return { data: data as PostMortem[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function insertPostMortem(
  supabase: SupabaseClient,
  input: PostMortemInput
): Promise<ServiceResult<PostMortem>> {
  try {
    const { data, error } = await supabase
      .from('post_mortems')
      .insert({ obra_id: input.obra_id })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as PostMortem, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

// Guarda la capa de juicio humano — no toca estado ni snapshot.
export async function actualizarPostMortem(
  supabase: SupabaseClient,
  id: string,
  input: ActualizarPostMortemInput
): Promise<ServiceResult<PostMortem>> {
  try {
    const cambios: Record<string, unknown> = {}
    if (input.causas_desvio !== undefined) cambios.causas_desvio = input.causas_desvio
    if (input.aprendizajes !== undefined) cambios.aprendizajes = input.aprendizajes
    if (input.acciones_recomendadas !== undefined) cambios.acciones_recomendadas = input.acciones_recomendadas
    if (input.cambios_sugeridos_cotizacion !== undefined)
      cambios.cambios_sugeridos_cotizacion = input.cambios_sugeridos_cotizacion
    if (input.notas !== undefined) cambios.notas = input.notas

    const { data, error } = await supabase.from('post_mortems').update(cambios).eq('id', id).select().single()
    if (error) return { data: null, error: error.message }
    return { data: data as PostMortem, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

// Cierra el post mortem: congela el snapshot ya armado (construirResumenSnapshot) y
// fija la fecha de cierre. El estado 'cerrado' sin snapshot/fecha lo rechaza la base
// (constraint post_mortems_cierre_check) — acá siempre se envían juntos.
export async function cerrarPostMortem(
  supabase: SupabaseClient,
  id: string,
  resumenSnapshot: ResumenSnapshotPostMortem,
  fechaCierre: string
): Promise<ServiceResult<PostMortem>> {
  try {
    const { data, error } = await supabase
      .from('post_mortems')
      .update({ estado: 'cerrado', resumen_snapshot: resumenSnapshot, fecha_cierre: fechaCierre })
      .eq('id', id)
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as PostMortem, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
