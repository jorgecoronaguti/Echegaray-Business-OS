'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { adicionalInputSchema, actualizarAdicionalInputSchema } from '../types'
import { insertAdicional, actualizarAdicional } from './adicionalesService'

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

export async function createAdicionalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const obraId = formData.get('obra_id')
  const parsed = adicionalInputSchema.safeParse({
    obra_id: obraId,
    concepto: formData.get('concepto'),
    origen: formData.get('origen'),
    detectado_por: formData.get('detectado_por'),
    fecha_deteccion: formData.get('fecha_deteccion'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertAdicional(client.supabase, parsed.data)
  if (error) return { error }

  if (typeof obraId === 'string' && obraId) revalidatePath(`/obras/${obraId}`)
  return { error: null }
}

export async function actualizarAdicionalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const adicionalId = formData.get('adicional_id')
  const obraId = formData.get('obra_id_para_revalidar')
  if (typeof adicionalId !== 'string' || !adicionalId) return { error: 'Adicional inválido' }

  const parsed = actualizarAdicionalInputSchema.safeParse({
    fecha_cotizacion: formData.get('fecha_cotizacion') || undefined,
    monto_cotizado: formData.get('monto_cotizado') || undefined,
    fecha_aprobacion: formData.get('fecha_aprobacion') || undefined,
    monto_aprobado: formData.get('monto_aprobado') || undefined,
    fecha_ejecucion: formData.get('fecha_ejecucion') || undefined,
    fecha_facturacion: formData.get('fecha_facturacion') || undefined,
    monto_facturado: formData.get('monto_facturado') || undefined,
    referencia_factura: formData.get('referencia_factura') || undefined,
    fecha_cobranza: formData.get('fecha_cobranza') || undefined,
    monto_cobrado: formData.get('monto_cobrado') || undefined,
    movimiento_caja_id: formData.get('movimiento_caja_id') || undefined,
    frenado: formData.get('frenado') === 'on' ? true : undefined,
    motivo_frenado: formData.get('motivo_frenado') || undefined,
    notas: formData.get('notas') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await actualizarAdicional(client.supabase, adicionalId, parsed.data)
  if (error) return { error }

  if (typeof obraId === 'string' && obraId) revalidatePath(`/obras/${obraId}`)
  return { error: null }
}
