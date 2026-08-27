'use server'

import { mensajeDeAuth } from './mensajeDeAuth'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/site-url'
import {
  contrasenaNuevaInputSchema, loginInputSchema, recuperarInputSchema,
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

// ═══ EL ALTA LIBRE SE FUE (27/08/2026), Y LA PUERTA DE VERDAD SIGUE ABIERTA ═══
//
// Acá vivía `signupAction`, que llamaba a `supabase.auth.signUp` y creaba una cuenta sin rol para
// que alguien la promoviera después a mano. Convivía con el alta GOBERNADA de
// `/administracion/usuarios`, que crea la persona, el perfil y el rol en un solo acto y sólo la
// abre quien ve economía. Dos altas para lo mismo, y la libre era la que no dejaba rastro.
//
// LO QUE ESTO NO CIERRA, Y HAY QUE CERRAR EN OTRO LADO: `enable_signup = true` sigue en la
// configuración de auth del proyecto. Con la clave anónima —que viaja en el navegador— cualquiera
// le pide un alta a `/auth/v1/signup` sin pasar por ninguna pantalla de este repositorio. Borrar el
// formulario saca el cartel; la puerta se apaga en la configuración del proyecto de Supabase, que
// es una acción sobre un sistema externo y no la decide este archivo.

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
