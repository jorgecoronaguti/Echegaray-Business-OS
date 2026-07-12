'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { HumanAction } from '../types'

/** Ejecuta una acción de control humano sobre una tarea del Work Fabric. Llama a
 *  la función RPC public.orq_task_action (SECURITY DEFINER, valida autenticación
 *  y la legalidad de la transición contra el state machine). */
export async function ejecutarAccionTarea(
  taskId: string,
  action: HumanAction,
  note?: string
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('orq_task_action', {
      p_task_id: taskId,
      p_action: action,
      p_note: note ?? null,
    })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/orquestador')
    return { ok: true, error: null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }
  }
}
