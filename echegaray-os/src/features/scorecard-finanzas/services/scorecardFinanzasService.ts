import type { SupabaseClient } from '@supabase/supabase-js'
import type { FilaScorecard } from '../types'

// Lectura del scorecard materializado (F6). La Web NO calcula: lee el snapshot vigente y la historia
// reciente (para la mini-tendencia). Ambas tablas dan SELECT sólo a `authenticated` (RLS): sin sesión
// el error es de permisos y la página muestra el aviso de RLS, no un crash.

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

const AREA = 'admin_finanzas'
// Cuántas corridas de historia traer para la mini-tendencia. Cada corrida = 16 filas.
const MAX_FILAS_HISTORIA = 16 * 30

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

/** Snapshot VIGENTE del área (última corrida) desde la vista. */
export async function getScorecardVigente(supabase: SupabaseClient): Promise<ServiceResult<FilaScorecard[]>> {
  try {
    const { data, error } = await supabase
      .from('finanzas_scorecard_vigente')
      .select('*')
      .eq('area', AREA)
      .order('orden', { ascending: true })
    if (error) return { data: null, error: error.message }
    return { data: (data ?? []) as FilaScorecard[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

/** Historia reciente del área para la mini-tendencia (viejo→nuevo lo ordena la vista de armado). */
export async function getScorecardHistoria(supabase: SupabaseClient): Promise<ServiceResult<FilaScorecard[]>> {
  try {
    const { data, error } = await supabase
      .from('finanzas_scorecard')
      .select('*')
      .eq('area', AREA)
      .order('capturado_en', { ascending: false })
      .limit(MAX_FILAS_HISTORIA)
    if (error) return { data: null, error: error.message }
    return { data: (data ?? []) as FilaScorecard[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
