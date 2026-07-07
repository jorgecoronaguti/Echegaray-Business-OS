'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { accionManualInputSchema, cambiarEstadoAccionInputSchema } from '../types'
import { insertAccionManual, insertAccionDesdeAlerta, cambiarEstadoAccion } from './accionesService'
import type { AlertaDashboard } from '@/features/dashboard/types'

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

export async function crearAccionManualAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = accionManualInputSchema.safeParse({
    titulo: formData.get('titulo'),
    area: formData.get('area'),
    obra_id: formData.get('obra_id') || undefined,
    contraparte: formData.get('contraparte') || undefined,
    monto: formData.get('monto') || undefined,
    fecha_limite: formData.get('fecha_limite') || undefined,
    responsable: formData.get('responsable') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertAccionManual(client.supabase, parsed.data)
  if (error) return { error }

  revalidatePath('/acciones')
  return { error: null }
}

// Recibe la alerta completa serializada en campos ocultos del formulario — la alerta
// no vive en ningún lado persistido, así que este es el único momento en que se puede
// capturar su contenido para convertirla en una Acción trazable.
export async function crearAccionDesdeAlertaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get('alerta_id')
  const titulo = formData.get('alerta_titulo')
  const severidad = formData.get('alerta_severidad')
  const categoria = formData.get('alerta_categoria')
  if (
    typeof id !== 'string' ||
    !id ||
    typeof titulo !== 'string' ||
    typeof severidad !== 'string' ||
    typeof categoria !== 'string'
  ) {
    return { error: 'Alerta inválida' }
  }

  const alerta: AlertaDashboard = {
    id,
    titulo,
    severidad: severidad as AlertaDashboard['severidad'],
    categoria: categoria as AlertaDashboard['categoria'],
    obraId: (formData.get('alerta_obra_id') as string) || null,
    obraNombre: (formData.get('alerta_obra_nombre') as string) || null,
    contraparte: (formData.get('alerta_contraparte') as string) || null,
    monto: formData.get('alerta_monto') ? Number(formData.get('alerta_monto')) : null,
    fechaCritica: (formData.get('alerta_fecha_critica') as string) || null,
    causa: (formData.get('alerta_causa') as string) || '',
    decisionSugerida: (formData.get('alerta_decision') as string) || '',
    link: (formData.get('alerta_link') as string) || null,
  }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertAccionDesdeAlerta(client.supabase, alerta)
  if (error) return { error }

  revalidatePath('/acciones')
  revalidatePath('/dashboard')
  return { error: null }
}

export async function cambiarEstadoAccionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const accionId = formData.get('accion_id')
  if (typeof accionId !== 'string' || !accionId) return { error: 'Acción inválida' }

  const parsed = cambiarEstadoAccionInputSchema.safeParse({
    estado: formData.get('estado'),
    resolucion_notas: formData.get('resolucion_notas') || undefined,
    fecha_resolucion: formData.get('fecha_resolucion') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await cambiarEstadoAccion(client.supabase, accionId, parsed.data)
  if (error) return { error }

  revalidatePath('/acciones')
  return { error: null }
}
