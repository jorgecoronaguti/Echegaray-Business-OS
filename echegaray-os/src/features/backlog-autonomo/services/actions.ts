'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { insertAccionDesdeBacklog } from './backlogAutonomoService'
import type { BacklogItem } from '../types'

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

// Recibe el item de backlog serializado en campos ocultos, igual que
// crearAccionDesdeAlertaAction -- el backlog no persiste el snapshot congelado,
// eso es responsabilidad de la Acción una vez creada.
export async function crearAccionDesdeBacklogAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get('backlog_id')
  const titulo = formData.get('backlog_titulo')
  const evidencia = formData.get('backlog_evidencia')
  const tipo = formData.get('backlog_tipo')
  const impacto = formData.get('backlog_impacto')
  const confianza = formData.get('backlog_confianza')
  if (
    typeof id !== 'string' ||
    !id ||
    typeof titulo !== 'string' ||
    typeof evidencia !== 'string' ||
    typeof tipo !== 'string' ||
    typeof impacto !== 'string' ||
    typeof confianza !== 'string'
  ) {
    return { error: 'Item de backlog inválido' }
  }

  const item: BacklogItem = {
    id,
    titulo,
    evidencia,
    tipo: tipo as BacklogItem['tipo'],
    impacto: impacto as BacklogItem['impacto'],
    confianza: confianza as BacklogItem['confianza'],
    fuente: '',
    urgencia: 'media',
    esfuerzo: 'bajo',
    dependencia: null,
    recomendacion: '',
    nivel_autonomia_permitido: 'C',
    estado: 'abierto',
    created_at: '',
    updated_at: '',
  }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertAccionDesdeBacklog(client.supabase, item)
  if (error) return { error }

  revalidatePath('/backlog-autonomo')
  revalidatePath('/acciones')
  return { error: null }
}
