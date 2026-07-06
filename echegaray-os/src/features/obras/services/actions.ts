'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { obraInputSchema } from '../types'
import { insertObra } from './obrasService'

export type ActionState = { error: string | null }

const OBRAS_PATH = '/obras'

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

export async function createObraAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = obraInputSchema.safeParse({
    cliente_id: formData.get('cliente_id'),
    nombre: formData.get('nombre'),
    monto_contratado: formData.get('monto_contratado'),
    fecha_inicio: formData.get('fecha_inicio'),
    fecha_fin_objetivo: formData.get('fecha_fin_objetivo'),
    estado: formData.get('estado') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertObra(client.supabase, parsed.data)
  if (error) return { error }

  revalidatePath(OBRAS_PATH)
  return { error: null }
}
