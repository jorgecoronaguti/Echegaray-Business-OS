'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { obligacionInputSchema, aplicacionPagoInputSchema } from '../types'
import { insertObligacion, insertAplicacionPago } from './obligacionesService'

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

export async function createObligacionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const obraId = formData.get('obra_id')
  const parsed = obligacionInputSchema.safeParse({
    obra_id: obraId || undefined,
    proveedor_id: formData.get('proveedor_id') || undefined,
    compra_id: formData.get('compra_id') || undefined,
    costo_real_id: formData.get('costo_real_id') || undefined,
    concepto: formData.get('concepto'),
    monto_total: formData.get('monto_total'),
    fecha_origen: formData.get('fecha_origen'),
    fecha_vencimiento: formData.get('fecha_vencimiento') || undefined,
    fuente_legacy: formData.get('fuente_legacy'),
    notas: formData.get('notas') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertObligacion(client.supabase, parsed.data)
  if (error) return { error }

  revalidatePath('/obligaciones')
  if (typeof obraId === 'string' && obraId) revalidatePath(`/obras/${obraId}`)
  return { error: null }
}

export async function createAplicacionPagoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const obraId = formData.get('obra_id_para_revalidar')
  const parsed = aplicacionPagoInputSchema.safeParse({
    obligacion_id: formData.get('obligacion_id'),
    movimiento_caja_id: formData.get('movimiento_caja_id'),
    monto_aplicado: formData.get('monto_aplicado'),
    notas: formData.get('notas') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertAplicacionPago(client.supabase, parsed.data)
  if (error) return { error }

  revalidatePath('/obligaciones')
  if (typeof obraId === 'string' && obraId) revalidatePath(`/obras/${obraId}`)
  return { error: null }
}
