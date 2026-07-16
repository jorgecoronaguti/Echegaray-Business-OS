'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPerfilActual } from '@/features/auth/services/authService'

const PATH = '/operarios'
export type OperarioActionState = { error: string | null; ok?: boolean; password?: string; email?: string }

// Gate: solo 'direccion' puede gestionar operarios. Devuelve el admin client si autoriza.
async function soloDireccion() {
  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  if (perfil.data?.rol !== 'direccion') return { admin: null, error: 'Solo Dirección puede gestionar operarios.' }
  return { admin: createAdminClient(), error: null as string | null }
}

const altaSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
  email: z.string().trim().email('Email inválido'),
})

function passwordTemporal() {
  return 'Campo-' + Math.random().toString(36).slice(2, 8) + '!' + Math.floor(Math.random() * 90 + 10)
}

export async function crearOperarioAction(_prev: OperarioActionState, formData: FormData): Promise<OperarioActionState> {
  const parsed = altaSchema.safeParse({ nombre: formData.get('nombre'), email: formData.get('email') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const gate = await soloDireccion()
  if (!gate.admin) return { error: gate.error! }
  const { nombre, email } = parsed.data
  const password = passwordTemporal()

  // Crear (o reutilizar) el usuario de auth.
  let userId: string | undefined
  const { data: created, error: cErr } = await gate.admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (created?.user) userId = created.user.id
  else if (cErr && /already/i.test(cErr.message)) {
    const { data: list } = await gate.admin.auth.admin.listUsers({ perPage: 1000 })
    userId = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id
  } else if (cErr) return { error: cErr.message }
  if (!userId) return { error: 'no pude crear la cuenta' }

  const { error: pErr } = await gate.admin.from('perfiles').upsert({ id: userId, rol: 'campo', nombre }, { onConflict: 'id' })
  if (pErr) return { error: pErr.message }

  revalidatePath(PATH)
  return { error: null, ok: true, password, email }
}

export async function borrarOperarioAction(_prev: OperarioActionState, formData: FormData): Promise<OperarioActionState> {
  const id = String(formData.get('id') || '').trim()
  if (!id) return { error: 'falta id' }
  const gate = await soloDireccion()
  if (!gate.admin) return { error: gate.error! }
  // Seguridad: solo se borran perfiles con rol 'campo' (no dirección/admin por error).
  const { data: p } = await gate.admin.from('perfiles').select('rol').eq('id', id).maybeSingle()
  if (p?.rol !== 'campo') return { error: 'solo se pueden borrar operarios de campo' }
  await gate.admin.from('perfiles').delete().eq('id', id)
  await gate.admin.auth.admin.deleteUser(id)
  revalidatePath(PATH)
  return { error: null, ok: true }
}

export async function resetPasswordOperarioAction(_prev: OperarioActionState, formData: FormData): Promise<OperarioActionState> {
  const id = String(formData.get('id') || '').trim()
  const email = String(formData.get('email') || '').trim()
  if (!id) return { error: 'falta id' }
  const gate = await soloDireccion()
  if (!gate.admin) return { error: gate.error! }
  const { data: p } = await gate.admin.from('perfiles').select('rol').eq('id', id).maybeSingle()
  if (p?.rol !== 'campo') return { error: 'solo operarios de campo' }
  const password = passwordTemporal()
  const { error } = await gate.admin.auth.admin.updateUserById(id, { password })
  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { error: null, ok: true, password, email }
}
