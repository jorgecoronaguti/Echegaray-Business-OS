'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { equipoInputSchema } from '../types'
import { eliminarEquipo, insertEquipo } from './equiposService'

export type ActionState = { error: string | null }

const EQUIPOS_PATH = '/equipos'

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

export async function createEquipoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = equipoInputSchema.safeParse({
    nombre: formData.get('nombre'),
    tipo: formData.get('tipo'),
    patente_o_identificador: formData.get('patente_o_identificador') || undefined,
    notas: formData.get('notas') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertEquipo(client.supabase, parsed.data)
  if (error) return { error }

  revalidatePath(EQUIPOS_PATH)
  return { error: null }
}

export async function eliminarEquipoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get('equipo_id')
  if (typeof id !== 'string' || !id) return { error: 'Equipo inválido' }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await eliminarEquipo(client.supabase, id)
  if (error) return { error }

  revalidatePath(EQUIPOS_PATH)
  return { error: null }
}
