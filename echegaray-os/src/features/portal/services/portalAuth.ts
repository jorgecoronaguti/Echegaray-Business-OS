'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ResultadoAccion } from '@/shared/components/ui/FormAccion'
import { pedirLinkSchema } from '../types'

// LA PUERTA DEL PORTAL — Supabase OTP por mail.
//
// ═══ POR QUÉ NO ALCANZA CON `signInWithOtp` A SECAS ═══
//
// Supabase, con `shouldCreateUser: true`, le manda un enlace a CUALQUIER dirección que se escriba y
// le crea la cuenta. Eso convertiría el formulario en un alta pública: cualquiera con la URL entra
// como usuario del sistema. Por eso el mail se valida ANTES contra `cliente_acceso` y se manda con
// `shouldCreateUser: false` — la cuenta la crea el vínculo, no el formulario.
//
// ═══ POR QUÉ LA RESPUESTA ES LA MISMA HAYA O NO ACCESO ═══
//
// Si contestáramos «ese mail no está habilitado», el formulario sería un oráculo para averiguar
// quién trabaja con Echegaray: se prueban direcciones y las que contestan distinto son clientes.
// Se contesta siempre lo mismo. El rechazo real queda en el log del servidor, que es donde
// Administración lo puede mirar.

const RESPUESTA_UNIFORME =
  'Si el correo está habilitado, te llega un enlace de acceso en menos de un minuto. Revisá también el correo no deseado.'

/**
 * Le manda al cliente su enlace de acceso, si su mail está habilitado y no revocado.
 *
 * Devuelve `{ ok: true }` con el mismo texto en los dos casos. Ver arriba.
 */
export async function pedirLinkPortal(email: string): Promise<ResultadoAccion> {
  const parsed = pedirLinkSchema.safeParse({ email })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Escribí un correo válido' }
  }
  const { email: mail } = parsed.data

  // La consulta va con la clave de servicio porque quien pregunta NO TIENE SESIÓN todavía: con la
  // clave anónima la RLS de `cliente_acceso` devolvería vacío siempre y ningún mail entraría nunca.
  // El alcance está acotado a mano: se leen dos columnas de una fila buscada por su mail exacto.
  let habilitado = false
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('cliente_acceso')
      .select('id, revocado_at')
      .eq('email', mail)
      .maybeSingle()
    if (error) throw new Error(error.message)
    habilitado = Boolean(data && !data.revocado_at)
  } catch (e) {
    // Falla CERRADA: si no se puede confirmar la habilitación, no se manda ningún enlace. Un
    // permiso que se afloja cuando se cae la base no es un permiso.
    console.error('[portal] no pude verificar la habilitación:', e instanceof Error ? e.message : e)
    return { ok: true, mensaje: RESPUESTA_UNIFORME }
  }

  if (!habilitado) {
    console.warn(`[portal] enlace pedido para un mail sin acceso vigente: ${mail}`)
    return { ok: true, mensaje: RESPUESTA_UNIFORME }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: mail,
    options: {
      // LA LÍNEA QUE IMPIDE EL ALTA PÚBLICA. Sin esto, escribir cualquier dirección crea el usuario.
      shouldCreateUser: false,
      // El callback existente lee `next` (no `volver`) y su default es /contrasena-nueva, que para
      // un cliente —que no tiene ni va a tener contraseña— es el destino equivocado.
      emailRedirectTo: `${baseDelSitio()}/callback?next=${encodeURIComponent('/portal')}`,
    },
  })
  if (error) {
    console.error('[portal] signInWithOtp falló:', error.message)
    // Igual se responde lo mismo: distinguir acá volvería a abrir el oráculo.
  }
  return { ok: true, mensaje: RESPUESTA_UNIFORME }
}

/** La URL pública del sitio. El enlace del mail tiene que volver acá, no a localhost. */
function baseDelSitio(): string {
  return process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
}

/**
 * COMPLETA EL VÍNCULO DESPUÉS DEL PRIMER INGRESO. La llama el callback, con la sesión ya creada.
 *
 * Hace tres cosas que tienen que pasar juntas o ninguna:
 *   1. ata `auth_user_id` al acceso (es lo que `cliente_de_sesion()` traduce después),
 *   2. crea el `perfiles` con rol `cliente` si no existe,
 *   3. registra el ingreso.
 *
 * ═══ POR QUÉ VUELVE A VALIDAR ═══
 *
 * Entre que se pidió el enlace y que se hace clic pueden pasar horas, y en el medio el acceso pudo
 * revocarse. Un enlace válido de un acceso revocado NO puede crear el perfil: se cierra la sesión.
 * La validación al pedir el enlace no sirve como validación al usarlo.
 */
export async function completarIngresoPortal(): Promise<ResultadoAccion> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { ok: false, error: 'No hay sesión' }

  const email = user.email.trim().toLowerCase()
  const admin = createAdminClient()

  const { data: acceso, error: errAcceso } = await admin
    .from('cliente_acceso')
    .select('id, cliente_id, revocado_at, auth_user_id, primer_ingreso_at')
    .eq('email', email)
    .maybeSingle()

  if (errAcceso) return { ok: false, error: 'No pude verificar tu acceso' }

  // ═══ «NO ES UN CLIENTE» NO ES «ES UN CLIENTE RECHAZADO» ═══
  //
  // Por esta ruta pasan TAMBIÉN los empleados: es el mismo `/callback` que usa la recuperación de
  // contraseña. Un empleado no tiene fila en `cliente_acceso`, y tratarlo como acceso inválido le
  // cerraría la sesión en medio de su recuperación —un defecto que no da ningún error visible, sólo
  // manda al login a alguien que acababa de entrar bien—. Sin fila: esto no es asunto del portal y
  // se devuelve sin tocar nada.
  if (!acceso) return { ok: true }

  if (acceso.revocado_at) {
    // Acá sí: hay un acceso y está revocado. La sesión se cierra, porque dejarla abierta significaría
    // un usuario autenticado al que le sacamos el permiso dando vueltas por la app.
    await supabase.auth.signOut()
    return { ok: false, error: 'Tu acceso al portal no está vigente. Escribinos y lo revisamos.' }
  }
  // Un acceso ya atado a OTRA cuenta no se re-ata: sería mover el acceso de una persona a otra.
  if (acceso.auth_user_id && acceso.auth_user_id !== user.id) {
    await supabase.auth.signOut()
    return { ok: false, error: 'Ese correo ya está vinculado a otra cuenta' }
  }

  // El perfil primero: si el vínculo se escribiera antes y esto fallara, quedaría un acceso atado a
  // un usuario sin rol — que el middleware trata como «ni cliente ni empleado» y deja afuera de todo.
  const { error: errPerfil } = await admin
    .from('perfiles')
    .upsert({ id: user.id, rol: 'cliente', nombre: nombreDe(user.email) }, { onConflict: 'id' })
  if (errPerfil) return { ok: false, error: 'No pude preparar tu perfil' }

  const { error: errVinculo } = await admin
    .from('cliente_acceso')
    .update({
      auth_user_id: user.id,
      primer_ingreso_at: acceso.primer_ingreso_at ?? new Date().toISOString(),
      ultimo_ingreso_at: new Date().toISOString(),
    })
    .eq('id', acceso.id)
  if (errVinculo) return { ok: false, error: 'No pude vincular tu acceso' }

  // El ingreso queda en el libro de hechos que mira la pantalla 31.
  await admin.from('cliente_actividad_portal').insert({
    cliente_id: acceso.cliente_id, acceso_id: acceso.id, tipo: 'ingreso',
    detalle: acceso.primer_ingreso_at ? 'ingreso al portal' : 'primer ingreso al portal',
  })

  // `id` es el campo del resultado compartido para «qué fila quedó tocada»: acá, el cliente.
  return { ok: true, id: acceso.cliente_id }
}

/** `maria.gomez@arcor.com` → `Maria Gomez`. Un nombre provisorio; el real lo pone Administración. */
function nombreDe(email: string): string {
  const local = email.split('@')[0] ?? 'Cliente'
  const limpio = local.replace(/[._-]+/g, ' ').trim()
  return limpio.replace(/\b\p{Ll}/gu, (c) => c.toUpperCase()) || 'Cliente'
}


