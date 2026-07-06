'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { clienteInputSchema, cuentaFinancieraInputSchema, proveedorInputSchema } from '../types'
import { insertCliente, insertCuentaFinanciera, insertProveedor } from './fundacionService'

export type ActionState = { error: string | null }

const FUNDACION_PATH = '/fundacion'

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

export async function createClienteAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = clienteInputSchema.safeParse({ nombre: formData.get('nombre') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertCliente(client.supabase, parsed.data)
  if (error) return { error }

  revalidatePath(FUNDACION_PATH)
  return { error: null }
}

export async function createCuentaFinancieraAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = cuentaFinancieraInputSchema.safeParse({
    nombre: formData.get('nombre'),
    tipo: formData.get('tipo'),
    saldo_inicial: formData.get('saldo_inicial') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertCuentaFinanciera(client.supabase, parsed.data)
  if (error) return { error }

  revalidatePath(FUNDACION_PATH)
  return { error: null }
}

export async function createProveedorAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = proveedorInputSchema.safeParse({ nombre: formData.get('nombre') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertProveedor(client.supabase, parsed.data)
  if (error) return { error }

  revalidatePath(FUNDACION_PATH)
  return { error: null }
}
