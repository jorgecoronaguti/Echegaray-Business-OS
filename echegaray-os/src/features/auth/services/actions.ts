'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { loginInputSchema, signupInputSchema } from '../types'

export type ActionState = { error: string | null }

/** El rol de quien acaba de entrar, para saber a dónde mandarlo. Un error de lectura NO es un rol:
 *  devuelve `null` y el aterrizaje es el general, que es el que el middleware sabe corregir. */
async function rolDe(
  supabase: Awaited<ReturnType<typeof createClient>>, userId: string | undefined,
): Promise<string | null> {
  if (!userId) return null
  const { data } = await supabase.from('perfiles').select('rol').eq('id', userId).maybeSingle()
  return ((data as { rol: string } | null)?.rol) ?? null
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginInputSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')

  // ═══ EL ATERRIZAJE DEPENDE DE QUIÉN ENTRÓ (20/08/2026) ═══
  //
  // El aterrizaje general es el PORTAFOLIO DE OBRAS: es el primer módulo definitivo del OS y la obra
  // es el eje del negocio. Antes iba a `/dashboard`, que se borró con el frontend legacy — quien
  // entraba sin un `?volver=` caía en un 404 como primera pantalla del sistema.
  //
  // Pero el nivel `campo` NO PUEDE ABRIR `/obras`. El middleware lo rebota a `/hoy`… en la próxima
  // navegación con documento: el redirect de esta acción viaja por RSC y el router del cliente se
  // queda en `/obras`. Medido: el empleado entraba y veía la cartera de obras vacía hasta que tocaba
  // algo. Mandarlo directo a su pantalla no es una preferencia — es la única que puede abrir.
  const rol = await rolDe(supabase, data.user?.id)
  redirect(rol === 'campo' ? '/hoy' : '/obras')
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
