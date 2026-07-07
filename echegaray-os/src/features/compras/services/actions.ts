'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { compraInputSchema, actualizarCompraInputSchema } from '../types'
import { insertCompra, actualizarCompra } from './comprasService'

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

export async function createCompraAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const obraId = formData.get('obra_id')
  const parsed = compraInputSchema.safeParse({
    obra_id: obraId || undefined,
    proveedor_id: formData.get('proveedor_id') || undefined,
    concepto: formData.get('concepto'),
    fecha_necesidad: formData.get('fecha_necesidad'),
    fuente_legacy: formData.get('fuente_legacy'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertCompra(client.supabase, parsed.data)
  if (error) return { error }

  if (typeof obraId === 'string' && obraId) revalidatePath(`/obras/${obraId}`)
  return { error: null }
}

export async function actualizarCompraAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const compraId = formData.get('compra_id')
  const obraId = formData.get('obra_id_para_revalidar')
  if (typeof compraId !== 'string' || !compraId) return { error: 'Compra inválida' }

  const parsed = actualizarCompraInputSchema.safeParse({
    fecha_solicitud: formData.get('fecha_solicitud') || undefined,
    fecha_cotizacion: formData.get('fecha_cotizacion') || undefined,
    monto_cotizado: formData.get('monto_cotizado') || undefined,
    fecha_orden: formData.get('fecha_orden') || undefined,
    monto_orden: formData.get('monto_orden') || undefined,
    referencia_orden: formData.get('referencia_orden') || undefined,
    fecha_entrega_prevista: formData.get('fecha_entrega_prevista') || undefined,
    fecha_recepcion: formData.get('fecha_recepcion') || undefined,
    monto_recibido: formData.get('monto_recibido') || undefined,
    notas: formData.get('notas') || undefined,
    movimiento_caja_id_a_vincular: formData.get('movimiento_caja_id_a_vincular') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await actualizarCompra(client.supabase, compraId, parsed.data)
  if (error) return { error }

  if (typeof obraId === 'string' && obraId) revalidatePath(`/obras/${obraId}`)
  return { error: null }
}
