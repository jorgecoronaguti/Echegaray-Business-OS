// MÓDULO 01 — OBRAS · el acceso a datos.
//
// CERO SQL NUEVO Y CERO DATO FABRICADO. Todo sale de estructuras canónicas: la vista `obra_panel`
// (que a su vez cruza `obra_canonica` con `obra_costo_real`), y las tablas `obra_actividad`,
// `obra_restriccion` y `obra_documento`. No se lee `public.obras` legacy en ninguna consulta — es la
// tabla que tenía las 4 obras pausadas y hacía que la web dijera "0 obras activas" mientras cuatro
// obras facturaban $287M.
//
// Los documentos se resuelven contra `drive_index`, que es el espejo del Drive: el archivo NO se
// copia ni se sirve desde acá, sólo se enlaza.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Actividad, DocumentoObra, ObraPanel, Restriccion, ServiceResult } from '../types'

/** El portafolio: una fila por obra, ordenado por el orden declarado y después por nombre. */
export async function getPortafolio(supabase: SupabaseClient): Promise<ServiceResult<ObraPanel[]>> {
  const { data, error } = await supabase
    .from('obra_panel')
    .select('*')
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as ObraPanel[], error: null }
}

export async function getObra(supabase: SupabaseClient, obraId: string): Promise<ServiceResult<ObraPanel>> {
  const { data, error } = await supabase.from('obra_panel').select('*').eq('obra_id', obraId).maybeSingle()
  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: `No existe la obra "${obraId}"` }
  return { data: data as ObraPanel, error: null }
}

/** El cronograma completo de una obra, en el orden del tracker de origen. */
export async function getActividades(supabase: SupabaseClient, obraId: string): Promise<ServiceResult<Actividad[]>> {
  const { data, error } = await supabase
    .from('obra_actividad')
    .select('*')
    .eq('obra_id', obraId)
    .order('orden', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as Actividad[], error: null }
}

/** Las restricciones. Las abiertas primero y, dentro de ellas, la que vence antes. */
export async function getRestricciones(supabase: SupabaseClient, obraId: string): Promise<ServiceResult<Restriccion[]>> {
  const { data, error } = await supabase
    .from('obra_restriccion')
    .select('*')
    .eq('obra_id', obraId)
    .order('estado', { ascending: true })
    .order('fecha_compromiso', { ascending: true, nullsFirst: false })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as Restriccion[], error: null }
}

/**
 * Los documentos de la obra: el vínculo vive en `obra_documento` y los metadatos en `drive_index`.
 * Se hacen dos consultas y se cruzan acá en vez de un join, porque `drive_index` se resincroniza
 * entero cada 4 horas y un archivo puede desaparecer de él sin que el vínculo deje de ser válido:
 * en ese caso se publica el vínculo con el nombre en null, que es la verdad, en lugar de perder la
 * fila entera en un `inner join`.
 */
export async function getDocumentos(supabase: SupabaseClient, obraId: string): Promise<ServiceResult<DocumentoObra[]>> {
  const { data: vinculos, error } = await supabase
    .from('obra_documento')
    .select('drive_file_id, rol, origen')
    .eq('obra_id', obraId)
  if (error) return { data: null, error: error.message }
  const ids = (vinculos ?? []).map((v) => v.drive_file_id as string)
  if (!ids.length) return { data: [], error: null }

  const { data: archivos } = await supabase
    .from('drive_index')
    .select('drive_file_id, name, path, mime_type, modified_time')
    .in('drive_file_id', ids)
  const porId = new Map((archivos ?? []).map((a) => [a.drive_file_id as string, a]))

  const docs: DocumentoObra[] = (vinculos ?? []).map((v) => {
    const a = porId.get(v.drive_file_id as string)
    return {
      drive_file_id: v.drive_file_id as string,
      rol: (v.rol as string) ?? null,
      origen: (v.origen as 'manual' | 'path_inferido') ?? 'manual',
      name: (a?.name as string) ?? null,
      path: (a?.path as string) ?? null,
      mime_type: (a?.mime_type as string) ?? null,
      modified_time: (a?.modified_time as string) ?? null,
    }
  })
  return { data: docs, error: null }
}

/**
 * EL LOOKAHEAD: las actividades cuya ventana toca las próximas `semanas` semanas.
 *
 * Es una VISTA del cronograma, no una tabla nueva. El Last Planner completo —compromiso semanal
 * congelado, PPC y causa de incumplimiento— exige dos listas cerradas que el dueño todavía no fijó,
 * y una lista que se cambia después rompe toda la serie histórica del Pareto. Hasta entonces esto
 * es el make-ready: qué viene, y qué lo está frenando.
 */
export function lookahead(actividades: Actividad[], semanas = 6, hoy = new Date()): Actividad[] {
  const desde = new Date(hoy); desde.setUTCHours(0, 0, 0, 0)
  const hasta = new Date(desde.getTime() + semanas * 7 * 86400000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const d0 = iso(desde); const d1 = iso(hasta)
  return actividades.filter((a) => {
    if (a.tipo === 'resumen') return false
    const ini = a.inicio_plan; const fin = a.fin_plan ?? a.inicio_plan
    if (!ini) return false
    // Toca la ventana si empieza dentro, o si empezó antes y todavía no terminó.
    return (ini >= d0 && ini <= d1) || (ini < d0 && (fin ?? ini) >= d0)
  })
}
