'use server'

import { mensajeDeAuth } from './mensajeDeAuth'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/site-url'
import {
  contrasenaNuevaInputSchema, loginInputSchema, recuperarInputSchema, signupInputSchema,
} from '../types'
import { urlDeRecuperacion } from './recuperacion'

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
  if (error) return { error: mensajeDeAuth(error.message) }

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
  if (error) return { error: mensajeDeAuth(error.message) }

  revalidatePath('/', 'layout')
  redirect('/login?registrado=1')
}

// ═══ RECUPERAR LA CONTRASEÑA (M01) ═══

export type EnvioState = { error: string | null; enviado: boolean }

/**
 * PEDIR EL CORREO DE RECUPERACIÓN.
 *
 * ═══ LA RESPUESTA ES LA MISMA EXISTA O NO LA CUENTA ═══
 *
 * `resetPasswordForEmail` contesta OK aunque el email no exista, y está bien que así sea: si la
 * pantalla dijera «esa dirección no está registrada», cualquiera con el formulario en la mano podría
 * averiguar quién tiene cuenta en el OS probando direcciones. Por eso esta acción nunca distingue
 * los dos casos y la pantalla dice «si esa dirección tiene cuenta».
 *
 * Lo único que sí se devuelve como error es lo que hay que ver: el límite de envíos de Supabase.
 * Tragárselo dejaría a alguien tocando «Enviar» sin que llegue nunca nada.
 *
 * LA URL DE VUELTA sale de `siteUrl()`, la URL pública canónica del OS — la misma que usa el resto
 * del sistema. No se arma con el `Host` del pedido: ese encabezado lo elige quien llama, y con él un
 * atacante haría que el enlace del correo apunte a su servidor. Supabase además exige que esté en la
 * lista de Redirect URLs del proyecto, que es la segunda cerradura.
 */
export async function recuperarAction(_prev: EnvioState, formData: FormData): Promise<EnvioState> {
  const parsed = recuperarInputSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { error: parsed.error.issues[0].message, enviado: false }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: urlDeRecuperacion(siteUrl()),
  })
  if (error) return { error: error.message, enviado: false }
  return { error: null, enviado: true }
}

/**
 * FIJAR LA CONTRASEÑA NUEVA, con la sesión que dejó el canje del enlace.
 *
 * Reusa `updateUser({ password })`, que es exactamente lo que hace «Mi cuenta»: es la misma
 * operación con otra puerta de entrada, y dos implementaciones del cambio de contraseña serían dos
 * reglas de largo mínimo que se pueden separar.
 *
 * SIN SESIÓN NO HAY CAMBIO, y el motivo se dice: el enlace del correo vence, y «no se pudo guardar»
 * a secas manda a la persona a probar de nuevo con el mismo enlace muerto.
 */
export async function contrasenaNuevaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = contrasenaNuevaInputSchema.safeParse({
    password: formData.get('password'),
    password2: formData.get('password2'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      error: 'El enlace ya venció o se usó. Pedí uno nuevo desde «Olvidé mi contraseña»: los enlaces '
        + 'de recuperación duran poco a propósito.',
    }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { error: mensajeDeAuth(error.message) }

  revalidatePath('/', 'layout')
  // Mismo aterrizaje que el login: quien acaba de recuperar la contraseña ya está adentro, y el
  // nivel campo no puede abrir `/obras`.
  const rol = await rolDe(supabase, user.id)
  redirect(rol === 'campo' ? '/hoy' : '/obras')
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
