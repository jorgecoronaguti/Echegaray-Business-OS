'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { movimientoCajaInputSchema } from '../types'
import { insertMovimientoCaja } from './movimientosCajaService'

export type ActionState = { error: string | null }

const CAJA_PATH = '/caja'

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

export async function createMovimientoCajaAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = movimientoCajaInputSchema.safeParse({
    tipo: formData.get('tipo'),
    estado: formData.get('estado'),
    monto: formData.get('monto'),
    cuenta_financiera_id: formData.get('cuenta_financiera_id'),
    fecha_esperada: formData.get('fecha_esperada'),
    fecha_real: formData.get('fecha_real') || undefined,
    cliente_id: formData.get('cliente_id') || undefined,
    proveedor_id: formData.get('proveedor_id') || undefined,
    obra_id: formData.get('obra_id') || undefined,
    concepto: formData.get('concepto'),
    origen: formData.get('origen') || undefined,
    referencia_externa: formData.get('referencia_externa') || undefined,
    notas: formData.get('notas') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertMovimientoCaja(client.supabase, parsed.data)
  if (error) return { error }

  revalidatePath(CAJA_PATH)
  return { error: null }
}
