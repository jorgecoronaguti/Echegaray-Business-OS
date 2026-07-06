'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { certificadoInputSchema, actualizarCertificadoInputSchema } from '../types'
import { insertCertificado, actualizarCertificado } from './ejecucionFinancieraService'

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

export async function createCertificadoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const obraId = formData.get('obra_id')
  const parsed = certificadoInputSchema.safeParse({
    obra_id: obraId,
    numero: formData.get('numero'),
    descripcion: formData.get('descripcion') || undefined,
    fecha_certificacion: formData.get('fecha_certificacion'),
    monto_certificado: formData.get('monto_certificado'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertCertificado(client.supabase, parsed.data)
  if (error) return { error }

  if (typeof obraId === 'string' && obraId) revalidatePath(`/obras/${obraId}`)
  return { error: null }
}

export async function actualizarCertificadoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const certificadoId = formData.get('certificado_id')
  const obraId = formData.get('obra_id_para_revalidar')
  if (typeof certificadoId !== 'string' || !certificadoId) return { error: 'Certificado inválido' }

  const parsed = actualizarCertificadoInputSchema.safeParse({
    fecha_facturacion: formData.get('fecha_facturacion') || undefined,
    monto_facturado: formData.get('monto_facturado') || undefined,
    referencia_factura: formData.get('referencia_factura') || undefined,
    fecha_vencimiento: formData.get('fecha_vencimiento') || undefined,
    fecha_cobranza: formData.get('fecha_cobranza') || undefined,
    monto_cobrado: formData.get('monto_cobrado') || undefined,
    movimiento_caja_id: formData.get('movimiento_caja_id') || undefined,
    notas: formData.get('notas') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await actualizarCertificado(client.supabase, certificadoId, parsed.data)
  if (error) return { error }

  if (typeof obraId === 'string' && obraId) revalidatePath(`/obras/${obraId}`)
  return { error: null }
}
