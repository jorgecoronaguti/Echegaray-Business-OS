'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { actualizarPersonaInputSchema, personaInputSchema } from '../types'
import { actualizarPersona, insertPersona } from './personasService'

export type ActionState = { error: string | null }

const PERSONAS_PATH = '/personas'

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

export async function createPersonaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = personaInputSchema.safeParse({
    nombre_completo: formData.get('nombre_completo'),
    dni: formData.get('dni') || undefined,
    cuil: formData.get('cuil') || undefined,
    fecha_nacimiento: formData.get('fecha_nacimiento') || undefined,
    nacionalidad: formData.get('nacionalidad') || undefined,
    fecha_ingreso: formData.get('fecha_ingreso'),
    categoria: formData.get('categoria') || undefined,
    especialidad: formData.get('especialidad') || undefined,
    art: formData.get('art') || undefined,
    obra_social: formData.get('obra_social') || undefined,
    convenio_colectivo: formData.get('convenio_colectivo') || undefined,
    retribucion_pactada: formData.get('retribucion_pactada') || undefined,
    modalidad_liquidacion: formData.get('modalidad_liquidacion') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertPersona(client.supabase, parsed.data)
  if (error) return { error }

  revalidatePath(PERSONAS_PATH)
  return { error: null }
}

export async function actualizarPersonaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = actualizarPersonaInputSchema.safeParse({
    persona_id: formData.get('persona_id'),
    categoria: formData.get('categoria') || undefined,
    especialidad: formData.get('especialidad') || undefined,
    retribucion_pactada: formData.get('retribucion_pactada') || undefined,
    fecha_egreso: formData.get('fecha_egreso') || undefined,
    notas: formData.get('notas') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await actualizarPersona(client.supabase, parsed.data)
  if (error) return { error }

  revalidatePath(PERSONAS_PATH)
  return { error: null }
}
