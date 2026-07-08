import type { SupabaseClient } from '@supabase/supabase-js'
import type { DocumentacionLegajo, Persona } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getPersonas(supabase: SupabaseClient): Promise<ServiceResult<Persona[]>> {
  try {
    const { data, error } = await supabase.from('personas').select('*').order('nombre_completo', { ascending: true })
    if (error) return { data: null, error: error.message }
    return { data: data as Persona[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function getDocumentacionLegajo(supabase: SupabaseClient): Promise<ServiceResult<DocumentacionLegajo[]>> {
  try {
    const { data, error } = await supabase.from('documentacion_legajo').select('*')
    if (error) return { data: null, error: error.message }
    return { data: data as DocumentacionLegajo[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
