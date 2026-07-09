import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActualizarPersonaInput, DocumentacionLegajo, Persona, PersonaInput } from '../types'

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

export async function insertPersona(supabase: SupabaseClient, input: PersonaInput): Promise<ServiceResult<Persona>> {
  try {
    const { data, error } = await supabase
      .from('personas')
      .insert({
        nombre_completo: input.nombre_completo,
        dni: input.dni ?? null,
        cuil: input.cuil ?? null,
        fecha_nacimiento: input.fecha_nacimiento ?? null,
        nacionalidad: input.nacionalidad ?? null,
        fecha_ingreso: input.fecha_ingreso,
        categoria: input.categoria ?? null,
        especialidad: input.especialidad ?? null,
        art: input.art ?? null,
        obra_social: input.obra_social ?? null,
        convenio_colectivo: input.convenio_colectivo ?? null,
        retribucion_pactada: input.retribucion_pactada ?? null,
        modalidad_liquidacion: input.modalidad_liquidacion ?? null,
        documentacion_relevada: false,
      })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as Persona, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function actualizarPersona(
  supabase: SupabaseClient,
  input: ActualizarPersonaInput
): Promise<ServiceResult<Persona>> {
  try {
    const cambios: Record<string, unknown> = {}
    if (input.categoria !== undefined) cambios.categoria = input.categoria
    if (input.especialidad !== undefined) cambios.especialidad = input.especialidad
    if (input.retribucion_pactada !== undefined) cambios.retribucion_pactada = input.retribucion_pactada
    if (input.fecha_egreso !== undefined) cambios.fecha_egreso = input.fecha_egreso
    if (input.notas !== undefined) cambios.notas = input.notas

    const { data, error } = await supabase
      .from('personas')
      .update(cambios)
      .eq('id', input.persona_id)
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as Persona, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
