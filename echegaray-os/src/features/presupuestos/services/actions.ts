'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { presupuestoInputSchema, partidaPresupuestoInputSchema } from '../types'
import { insertPresupuesto, insertPartidaPresupuesto } from './presupuestosService'

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

export async function createPresupuestoAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const obraId = formData.get('obra_id')
  const parsed = presupuestoInputSchema.safeParse({
    obra_id: obraId,
    estado: formData.get('estado') || undefined,
    monto_presupuestado: formData.get('monto_presupuestado'),
    costo_directo_presupuestado: formData.get('costo_directo_presupuestado'),
    costo_indirecto_presupuestado: formData.get('costo_indirecto_presupuestado') || undefined,
    margen_esperado: formData.get('margen_esperado'),
    fuente_legacy: formData.get('fuente_legacy'),
    fecha_presupuesto: formData.get('fecha_presupuesto'),
    hh_estimada: formData.get('hh_estimada') || undefined,
    notas: formData.get('notas') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertPresupuesto(client.supabase, parsed.data)
  if (error) return { error }

  revalidatePath(`/obras/${obraId}`)
  return { error: null }
}

export async function createPartidaPresupuestoAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const obraId = formData.get('obra_id_para_revalidar')
  const parsed = partidaPresupuestoInputSchema.safeParse({
    presupuesto_id: formData.get('presupuesto_id'),
    codigo: formData.get('codigo') || undefined,
    descripcion: formData.get('descripcion'),
    monto: formData.get('monto'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertPartidaPresupuesto(client.supabase, parsed.data)
  if (error) return { error }

  if (typeof obraId === 'string' && obraId) revalidatePath(`/obras/${obraId}`)
  return { error: null }
}
