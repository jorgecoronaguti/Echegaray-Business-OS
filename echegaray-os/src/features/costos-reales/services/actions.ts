'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { costoRealInputSchema } from '../types'
import { insertCostoReal } from './costosRealesService'

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

export async function createCostoRealAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const obraId = formData.get('obra_id')
  const parsed = costoRealInputSchema.safeParse({
    obra_id: obraId,
    proveedor_id: formData.get('proveedor_id') || undefined,
    concepto: formData.get('concepto'),
    monto: formData.get('monto'),
    fecha: formData.get('fecha'),
    estado: formData.get('estado') || undefined,
    movimiento_caja_id: formData.get('movimiento_caja_id') || undefined,
    fuente_legacy: formData.get('fuente_legacy'),
    notas: formData.get('notas') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertCostoReal(client.supabase, parsed.data)
  if (error) return { error }

  if (typeof obraId === 'string' && obraId) revalidatePath(`/obras/${obraId}`)
  return { error: null }
}
