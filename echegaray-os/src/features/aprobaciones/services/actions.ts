'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const Input = z.object({
  id: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  note: z.string().max(2000).optional(),
})

/** Aprueba o rechaza una operación pendiente. Llama a la RPC public.orq_operation_action
 *  (SECURITY DEFINER, exige usuario autenticado). Al aprobar NO ejecuta el efecto
 *  externo: sólo marca 'approved'; el worker la ejecuta de forma diferida e idempotente. */
export async function decidirOperacion(
  raw: { id: string; action: 'approve' | 'reject'; note?: string },
): Promise<{ ok: boolean; error: string | null }> {
  const parsed = Input.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Entrada inválida' }
  const { id, action, note } = parsed.data
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('orq_operation_action', {
      p_id: id,
      p_action: action,
      p_note: note ?? null,
    })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/aprobaciones')
    return { ok: true, error: null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }
  }
}
