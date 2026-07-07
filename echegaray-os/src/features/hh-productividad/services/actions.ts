'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { registroHHInputSchema } from '../types'
import { insertRegistroHH } from './hhProductividadService'

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

export async function createRegistroHHAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const obraId = formData.get('obra_id')
  const parsed = registroHHInputSchema.safeParse({
    obra_id: obraId,
    trabajador_o_cuadrilla: formData.get('trabajador_o_cuadrilla'),
    categoria: formData.get('categoria') || undefined,
    fecha_inicio_semana: formData.get('fecha_inicio_semana'),
    horas: formData.get('horas'),
    costo_real_id: formData.get('costo_real_id') || undefined,
    fuente_legacy: formData.get('fuente_legacy'),
    notas: formData.get('notas') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertRegistroHH(client.supabase, parsed.data)
  if (error) return { error }

  if (typeof obraId === 'string' && obraId) revalidatePath(`/obras/${obraId}`)
  return { error: null }
}
