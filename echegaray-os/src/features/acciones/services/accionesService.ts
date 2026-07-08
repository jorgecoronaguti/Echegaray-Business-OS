import type { SupabaseClient } from '@supabase/supabase-js'
import type { Accion, AccionManualInput, CambiarEstadoAccionInput, BloqueoAccionInput } from '../types'
import type { AlertaDashboardBase } from '@/features/dashboard/types'
import { accionDesdeAlerta } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getAcciones(supabase: SupabaseClient): Promise<ServiceResult<Accion[]>> {
  try {
    const { data, error } = await supabase.from('acciones').select('*').order('created_at', { ascending: false })
    if (error) return { data: null, error: error.message }
    return { data: data as Accion[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

// Mapa alerta_origen_id -> Accion, para saber en la UI si una alerta ya fue
// convertida en acción (y no ofrecer convertirla de nuevo).
export function accionesPorAlertaOrigen(acciones: Accion[]): Map<string, Accion> {
  const mapa = new Map<string, Accion>()
  for (const a of acciones) {
    if (a.alerta_origen_id) mapa.set(a.alerta_origen_id, a)
  }
  return mapa
}

export async function insertAccionManual(
  supabase: SupabaseClient,
  input: AccionManualInput
): Promise<ServiceResult<Accion>> {
  try {
    const { data, error } = await supabase
      .from('acciones')
      .insert({
        origen: 'manual',
        titulo: input.titulo,
        area: input.area,
        obra_id: input.obra_id ?? null,
        contraparte: input.contraparte ?? null,
        monto: input.monto ?? null,
        fecha_limite: input.fecha_limite ?? null,
        responsable: input.responsable ?? null,
      })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as Accion, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

// Convierte una alerta ya calculada en una Acción trazable. El índice único parcial
// sobre alerta_origen_id (ver migración) rechaza crear una segunda acción para la
// misma alerta — acá se traduce ese error a un mensaje legible.
export async function insertAccionDesdeAlerta(
  supabase: SupabaseClient,
  alerta: AlertaDashboardBase,
  responsable?: string
): Promise<ServiceResult<Accion>> {
  try {
    const { data, error } = await supabase
      .from('acciones')
      .insert({ ...accionDesdeAlerta(alerta), responsable: responsable ?? null })
      .select()
      .single()
    if (error) {
      if (error.code === '23505') return { data: null, error: 'Esta alerta ya fue convertida en una acción.' }
      return { data: null, error: error.message }
    }
    return { data: data as Accion, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function cambiarEstadoAccion(
  supabase: SupabaseClient,
  id: string,
  input: CambiarEstadoAccionInput
): Promise<ServiceResult<Accion>> {
  try {
    const cambios: Record<string, unknown> = { estado: input.estado }
    if (input.estado === 'resuelta' || input.estado === 'descartada') {
      cambios.fecha_resolucion = input.fecha_resolucion
      cambios.resolucion_notas = input.resolucion_notas ?? null
      cambios.resultado_real = input.resultado_real ?? null
      cambios.aprendizaje_asociado = input.aprendizaje_asociado ?? null
    } else {
      // Reabrir una acción ya resuelta/descartada limpia el cierre anterior —
      // evita dejar una fecha de resolución "fantasma" en una acción activa de nuevo.
      cambios.fecha_resolucion = null
      cambios.resolucion_notas = null
      cambios.resultado_real = null
      cambios.aprendizaje_asociado = null
    }

    const { data, error } = await supabase.from('acciones').update(cambios).eq('id', id).select().single()
    if (error) return { data: null, error: error.message }
    return { data: data as Accion, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function actualizarBloqueoAccion(
  supabase: SupabaseClient,
  id: string,
  input: BloqueoAccionInput
): Promise<ServiceResult<Accion>> {
  try {
    const { data, error } = await supabase
      .from('acciones')
      .update({
        bloqueada: input.bloqueada,
        motivo_bloqueo: input.bloqueada ? (input.motivo_bloqueo ?? null) : null,
        evidencia: input.evidencia ?? null,
      })
      .eq('id', id)
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as Accion, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
