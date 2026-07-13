'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/** Carga un objetivo de Dirección. Llama a la RPC public.orq_submit_objective, que
 *  crea una tarea type='direction' para el Director IA (SECURITY DEFINER, exige
 *  usuario autenticado). El Director la procesa en el Work Fabric. */
export async function cargarObjetivo(
  formData: FormData
): Promise<{ ok: boolean; error: string | null }> {
  const title = String(formData.get('title') ?? '').trim()
  const goal = String(formData.get('goal') ?? '').trim()
  const priority = Number(formData.get('priority') ?? 0) || 0
  if (!goal) return { ok: false, error: 'El objetivo no puede estar vacío.' }
  try {
    const supabase = await createClient()
    // La UI NO decide el motor: se omite p_engine para que la tarea raíz quede
    // sin override y el router (orq.model_routes) resuelva direction.plan →
    // anthropic-api. La RPC default-ea p_engine a null (ver migración
    // 20260714140000). El conocimiento del engine vive sólo en model_routes.
    const { error } = await supabase.rpc('orq_submit_objective', {
      p_title: title || goal.slice(0, 80),
      p_goal: goal,
      p_priority: priority,
    })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/direccion')
    return { ok: true, error: null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }
  }
}
