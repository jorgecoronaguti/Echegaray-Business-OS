import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Presupuesto,
  PresupuestoInput,
  PartidaPresupuesto,
  PartidaPresupuestoInput,
} from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getPresupuestosPorObra(
  supabase: SupabaseClient,
  obraId: string
): Promise<ServiceResult<Presupuesto[]>> {
  try {
    const { data, error } = await supabase
      .from('presupuestos')
      .select('*')
      .eq('obra_id', obraId)
      .order('version', { ascending: false })
    if (error) return { data: null, error: error.message }
    return { data: data as Presupuesto[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function getPartidasPorPresupuesto(
  supabase: SupabaseClient,
  presupuestoId: string
): Promise<ServiceResult<PartidaPresupuesto[]>> {
  try {
    const { data, error } = await supabase
      .from('partidas_presupuesto')
      .select('*')
      .eq('presupuesto_id', presupuestoId)
      .order('created_at', { ascending: true })
    if (error) return { data: null, error: error.message }
    return { data: data as PartidaPresupuesto[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

// Aprobar una versión nueva reemplaza a la anterior — dos pasos secuenciales, no una
// transacción SQL atómica (documentado como límite aceptado en PRP-003).
export async function insertPresupuesto(
  supabase: SupabaseClient,
  input: PresupuestoInput
): Promise<ServiceResult<Presupuesto>> {
  try {
    const { data: existentes, error: errorExistentes } = await supabase
      .from('presupuestos')
      .select('version')
      .eq('obra_id', input.obra_id)
      .order('version', { ascending: false })
      .limit(1)
    if (errorExistentes) return { data: null, error: errorExistentes.message }

    const siguienteVersion = ((existentes?.[0] as { version: number } | undefined)?.version ?? 0) + 1

    if (input.estado === 'aprobado') {
      const { error: errorReemplazo } = await supabase
        .from('presupuestos')
        .update({ estado: 'reemplazado' })
        .eq('obra_id', input.obra_id)
        .eq('estado', 'aprobado')
      if (errorReemplazo) return { data: null, error: errorReemplazo.message }
    }

    const { data, error } = await supabase
      .from('presupuestos')
      .insert({
        obra_id: input.obra_id,
        version: siguienteVersion,
        estado: input.estado,
        monto_presupuestado: input.monto_presupuestado,
        costo_directo_presupuestado: input.costo_directo_presupuestado,
        costo_indirecto_presupuestado: input.costo_indirecto_presupuestado,
        margen_esperado: input.margen_esperado,
        fuente_legacy: input.fuente_legacy,
        fecha_presupuesto: input.fecha_presupuesto,
        hh_estimada: input.hh_estimada ?? null,
        notas: input.notas ?? null,
      })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as Presupuesto, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}

export async function insertPartidaPresupuesto(
  supabase: SupabaseClient,
  input: PartidaPresupuestoInput
): Promise<ServiceResult<PartidaPresupuesto>> {
  try {
    const { data, error } = await supabase
      .from('partidas_presupuesto')
      .insert({
        presupuesto_id: input.presupuesto_id,
        codigo: input.codigo ?? null,
        descripcion: input.descripcion,
        monto: input.monto,
      })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    return { data: data as PartidaPresupuesto, error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
