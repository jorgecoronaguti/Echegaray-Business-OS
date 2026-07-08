'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { loginInputSchema, signupInputSchema } from '../types'

export type ActionState = { error: string | null }

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginInputSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

// Signup crea la cuenta en auth.users pero NO le asigna rol -- eso lo hace Jorge
// manualmente en Supabase (perfiles). Sin perfil, current_rol() devuelve null y
// ninguna policy de escritura por rol lo deja pasar -- lectura sigue disponible.
export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signupInputSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    nombre: formData.get('nombre'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { nombre: parsed.data.nombre } },
  })
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  redirect('/login?registrado=1')
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
