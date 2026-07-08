'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { planSemanalInputSchema, cierreSemanalInputSchema } from '../types'
import { insertPlanSemanal, cerrarSemanaActividad } from './actividadesSemanalesService'

export type ActionState = { error: string | null }

async function createClientOrError(): Promise<
  { supabase: Awaited<ReturnType<typeof createClient>>; error: null } | { supabase: null; error: string }
> {
  try {
    return { supabase: await createClient(), error: null }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    return { supabase: null, error }
  }
}

export async function crearPlanSemanalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const obraId = formData.get('obra_id')
  const parsed = planSemanalInputSchema.safeParse({
    obra_id: obraId,
    semana_inicio: formData.get('semana_inicio'),
    actividad: formData.get('actividad'),
    frente: formData.get('frente') || undefined,
    responsable: formData.get('responsable'),
    avance_objetivo: formData.get('avance_objetivo') || undefined,
    hh_objetivo: formData.get('hh_objetivo') || undefined,
    restricciones: formData.get('restricciones') || undefined,
    fuente_legacy: formData.get('fuente_legacy') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertPlanSemanal(client.supabase, parsed.data)
  if (error) return { error }

  if (typeof obraId === 'string' && obraId) revalidatePath(`/obras/${obraId}`)
  return { error: null }
}

export async function cerrarSemanaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actividadId = formData.get('actividad_id')
  const obraId = formData.get('obra_id')
  const parsed = cierreSemanalInputSchema.safeParse({
    avance_real: formData.get('avance_real'),
    hh_real: formData.get('hh_real') || undefined,
    causa_desvio: formData.get('causa_desvio') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  if (typeof actividadId !== 'string' || !actividadId) return { error: 'Actividad inválida' }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await cerrarSemanaActividad(client.supabase, actividadId, parsed.data)
  if (error) return { error }

  if (typeof obraId === 'string' && obraId) revalidatePath(`/obras/${obraId}`)
  return { error: null }
}
