import type { SupabaseClient } from '@supabase/supabase-js'
import type { ScorecardDominio } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getScorecardDominios(supabase: SupabaseClient): Promise<ServiceResult<ScorecardDominio[]>> {
  try {
    const { data, error } = await supabase
      .from('scorecard_dominios')
      .select('*')
      .order('nivel_actual', { ascending: true })
    if (error) return { data: null, error: error.message }
    return { data: data as ScorecardDominio[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
