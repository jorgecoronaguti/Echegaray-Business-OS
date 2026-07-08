'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { confirmarClasificacionInputSchema } from '../types'
import { confirmarClasificacion, marcarSinObraAplicable } from './clasificacionCostosService'

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

export async function confirmarClasificacionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = confirmarClasificacionInputSchema.safeParse({
    clasificacion_id: formData.get('clasificacion_id'),
    obra_id: formData.get('obra_id'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await confirmarClasificacion(client.supabase, parsed.data.clasificacion_id, parsed.data.obra_id)
  if (error) return { error }

  revalidatePath('/administracion')
  revalidatePath('/obras')
  return { error: null }
}

export async function marcarSinObraAplicableAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const clasificacionId = formData.get('clasificacion_id')
  if (typeof clasificacionId !== 'string' || !clasificacionId) return { error: 'Clasificación inválida' }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await marcarSinObraAplicable(client.supabase, clasificacionId)
  if (error) return { error }

  revalidatePath('/administracion')
  return { error: null }
}
