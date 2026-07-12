import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrqTask, OrqAttempt, OrqEvent, OrqAgent, OrqQueueRow } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getQueue(supabase: SupabaseClient): Promise<ServiceResult<OrqQueueRow[]>> {
  try {
    const { data, error } = await supabase.from('orq_queue').select('*')
    if (error) return { data: null, error: error.message }
    return { data: data as OrqQueueRow[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function getRecentTasks(supabase: SupabaseClient, limit = 25): Promise<ServiceResult<OrqTask[]>> {
  try {
    const { data, error } = await supabase
      .from('orq_tasks').select('*').order('created_at', { ascending: false }).limit(limit)
    if (error) return { data: null, error: error.message }
    return { data: data as OrqTask[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function getDeadLetter(supabase: SupabaseClient): Promise<ServiceResult<OrqTask[]>> {
  try {
    const { data, error } = await supabase
      .from('orq_tasks').select('*').eq('state', 'dead_letter').order('updated_at', { ascending: false }).limit(50)
    if (error) return { data: null, error: error.message }
    return { data: data as OrqTask[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function getRecentEvents(supabase: SupabaseClient, limit = 30): Promise<ServiceResult<OrqEvent[]>> {
  try {
    const { data, error } = await supabase
      .from('orq_events').select('*').order('id', { ascending: false }).limit(limit)
    if (error) return { data: null, error: error.message }
    return { data: data as OrqEvent[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function getAgents(supabase: SupabaseClient): Promise<ServiceResult<OrqAgent[]>> {
  try {
    const { data, error } = await supabase.from('orq_agents').select('*').order('slug')
    if (error) return { data: null, error: error.message }
    return { data: data as OrqAgent[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function getWorkerActivity(supabase: SupabaseClient): Promise<ServiceResult<OrqAttempt[]>> {
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('orq_task_attempts').select('*').gte('started_at', since).order('started_at', { ascending: false }).limit(100)
    if (error) return { data: null, error: error.message }
    return { data: data as OrqAttempt[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
