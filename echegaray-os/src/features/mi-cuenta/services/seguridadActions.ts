'use server'

// SEGURIDAD DE LA CUENTA — lo que cada uno escribe de su propio acceso.
//
// ═══ LA CONTRASEÑA SE CAMBIA CON LA ACTUAL ═══
//
// `updateUser({ password })` no pide la vieja: con la sesión abierta alcanza. Eso es exactamente el
// problema —una sesión olvidada en la máquina del obrador cambia la contraseña de la cuenta y deja
// afuera a su dueño—. Acá la actual se comprueba de verdad: un `signInWithPassword` con un cliente
// aparte, sin cookies, que no toca la sesión de la pantalla. Si no entra, no se cambia.
//
// ═══ LOS DOS PASOS SON LOS DE SUPABASE (TOTP) ═══
//
// `mfa.enroll` crea el factor y devuelve el QR y la clave; `mfa.challenge` + `mfa.verify` con el
// primer código lo dejan verificado y suben la sesión a `aal2`. Para quitar un factor verificado
// Supabase exige estar en `aal2`, así que quitar también pide un código. Nada de esto guarda el
// secreto en este repositorio: vive en el servidor de Auth.
//
// LA COOKIE `os_mfa` SE REESCRIBE ACÁ: es lo que el middleware mira para exigir el segundo paso, y
// sin esto tardaría hasta cinco minutos en enterarse (ver `lib/auth/mfa.ts`).

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createClient as clienteSuelto } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { COOKIE_MFA, codigoTotp, sellarExigeDosPasos, type ExigeDosPasos } from '@/lib/auth/mfa'
import { VIDA_ROL_SEGUNDOS, secretoDelRol } from '@/lib/auth/rol-cache'
import { mensajeDeAuth } from '@/features/auth/services/mensajeDeAuth'

export type Resultado = { ok: true; id?: string } | { ok: false; error: string }

async function usuario() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

async function sellarCookieMfa(uid: string, valor: ExigeDosPasos) {
  const secreto = secretoDelRol()
  if (!secreto) return
  ;(await cookies()).set(COOKIE_MFA, await sellarExigeDosPasos(uid, valor, secreto), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: VIDA_ROL_SEGUNDOS,
  })
}

// ── CONTRASEÑA ──────────────────────────────────────────────────────────────────────────────────

export async function cambiarContrasenaConLaActual(form: FormData): Promise<Resultado> {
  const actual = String(form.get('actual') ?? '')
  const nueva = String(form.get('password') ?? '')
  const repetida = String(form.get('password2') ?? '')
  if (!actual) return { ok: false, error: 'Escribí la contraseña actual.' }
  if (nueva.length < 6) return { ok: false, error: 'La contraseña nueva debe tener al menos 6 caracteres.' }
  if (nueva !== repetida) return { ok: false, error: 'Las dos contraseñas nuevas no coinciden.' }
  if (nueva === actual) return { ok: false, error: 'La nueva es igual a la actual.' }

  const { supabase, user } = await usuario()
  if (!user?.email) return { ok: false, error: 'Tu sesión venció. Volvé a entrar.' }

  // UN CLIENTE APARTE, SIN COOKIES: comprueba la contraseña y se descarta. Con el cliente de la
  // pantalla, un `signInWithPassword` reemplazaría la sesión actual (y su nivel `aal2`).
  const prueba = clienteSuelto(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error: eActual } = await prueba.auth.signInWithPassword({ email: user.email, password: actual })
  if (eActual) {
    return { ok: false, error: /invalid/i.test(eActual.message) ? 'La contraseña actual no es correcta.' : mensajeDeAuth(eActual.message) }
  }
  // La sesión de prueba que acaba de abrirse se cierra en el servidor: no queda una sesión más a tu nombre.
  await prueba.auth.signOut({ scope: 'local' }).catch(() => null)

  const { error } = await supabase.auth.updateUser({ password: nueva })
  if (error) return { ok: false, error: mensajeDeAuth(error.message) }
  revalidatePath('/mi-cuenta/seguridad')
  return { ok: true }
}

// ── DOS PASOS ───────────────────────────────────────────────────────────────────────────────────

export type InicioDosPasos =
  | { ok: true; factorId: string; qr: string; secreto: string; uri: string }
  | { ok: false; error: string }

/** Crea el factor TOTP y devuelve lo que hay que cargar en la app de códigos. Todavía no protege nada. */
export async function iniciarDosPasos(): Promise<InicioDosPasos> {
  const { supabase, user } = await usuario()
  if (!user) return { ok: false, error: 'Tu sesión venció. Volvé a entrar.' }

  // Un intento anterior que quedó a medias (factor sin verificar) se borra: Supabase rechaza dos
  // factores con el mismo nombre y la persona quedaría trabada sin saber por qué.
  const { data: lista } = await supabase.auth.mfa.listFactors()
  for (const f of lista?.all ?? []) {
    if (f.factor_type === 'totp' && f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Echegaray OS', issuer: 'Echegaray OS' })
  if (error || !data) return { ok: false, error: error?.message ?? 'No pude iniciar los dos pasos.' }
  return { ok: true, factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret, uri: data.totp.uri }
}

/** El primer código de la app confirma el factor. Desde acá la cuenta exige dos pasos al entrar. */
export async function confirmarDosPasos(factorId: string, form: FormData): Promise<Resultado> {
  const codigo = codigoTotp(form.get('codigo'))
  if (!codigo) return { ok: false, error: 'El código son seis dígitos.' }
  const { supabase, user } = await usuario()
  if (!user) return { ok: false, error: 'Tu sesión venció. Volvé a entrar.' }

  const { data: reto, error: eReto } = await supabase.auth.mfa.challenge({ factorId })
  if (eReto || !reto) return { ok: false, error: eReto?.message ?? 'No pude pedir el código.' }
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: reto.id, code: codigo })
  if (error) return { ok: false, error: /invalid/i.test(error.message) ? 'Ese código no es válido. Mirá la app y probá con el siguiente.' : error.message }

  await sellarCookieMfa(user.id, 'si')
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Quita el factor. Pide un código: Supabase exige `aal2` para quitar un factor verificado. */
export async function quitarDosPasos(factorId: string, form: FormData): Promise<Resultado> {
  const codigo = codigoTotp(form.get('codigo'))
  if (!codigo) return { ok: false, error: 'Para quitar los dos pasos, poné el código actual de la app.' }
  const { supabase, user } = await usuario()
  if (!user) return { ok: false, error: 'Tu sesión venció. Volvé a entrar.' }

  const { data: reto, error: eReto } = await supabase.auth.mfa.challenge({ factorId })
  if (eReto || !reto) return { ok: false, error: eReto?.message ?? 'No pude pedir el código.' }
  const { error: eVerif } = await supabase.auth.mfa.verify({ factorId, challengeId: reto.id, code: codigo })
  if (eVerif) return { ok: false, error: /invalid/i.test(eVerif.message) ? 'Ese código no es válido.' : eVerif.message }

  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) return { ok: false, error: error.message }

  await sellarCookieMfa(user.id, 'no')
  revalidatePath('/', 'layout')
  return { ok: true }
}

// ── EL SEGUNDO PASO AL ENTRAR ───────────────────────────────────────────────────────────────────

export type EstadoSegundoPaso = { error: string | null }

/**
 * Canjea el código por una sesión `aal2`. Lo llama `/login/dos-pasos`; el destino lo decide la
 * pantalla con `redirect`, que no puede vivir adentro de un `try`.
 */
export async function verificarSegundoPaso(_prev: EstadoSegundoPaso, form: FormData): Promise<EstadoSegundoPaso> {
  const codigo = codigoTotp(form.get('codigo'))
  if (!codigo) return { error: 'El código son seis dígitos.' }
  const { supabase, user } = await usuario()
  if (!user) return { error: 'Tu sesión venció. Volvé a entrar.' }

  const { data: lista, error: eLista } = await supabase.auth.mfa.listFactors()
  const factor = lista?.totp.find((f) => f.status === 'verified')
  if (eLista || !factor) return { error: eLista?.message ?? 'Esta cuenta no tiene dos pasos activos.' }

  const { data: reto, error: eReto } = await supabase.auth.mfa.challenge({ factorId: factor.id })
  if (eReto || !reto) return { error: eReto?.message ?? 'No pude pedir el código.' }
  const { error } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: reto.id, code: codigo })
  if (error) return { error: /invalid/i.test(error.message) ? 'Ese código no es válido. Mirá la app y probá con el siguiente.' : error.message }

  await sellarCookieMfa(user.id, 'si')
  revalidatePath('/', 'layout')
  return { error: null }
}
