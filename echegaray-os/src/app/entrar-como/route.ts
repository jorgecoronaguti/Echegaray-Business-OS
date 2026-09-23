import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { estadoDeCuenta } from '@/features/usuarios/services/usuariosService'
import { COOKIE_ROL, secretoDelRol } from '@/lib/auth/rol-cache'
import { COOKIE_VER_COMO } from '@/lib/auth/ver-como'
import { COOKIE_MFA } from '@/lib/auth/mfa'
import {
  COOKIE_ENTRAR_COMO, ROL_QUE_ENTRA, VIDA_ENTRAR_COMO_SEGUNDOS, leerEntrarComo, puedeEntrarComo, sellarEntrarComo,
} from '@/lib/auth/entrar-como'
import type { Rol } from '@/features/auth/types'

// LA PUERTA DE «ENTRAR COMO»: abre la sesión real de otro usuario, y la devuelve.
//
//   POST /entrar-como?usuario=<id>   Dirección entra como esa cuenta
//   POST /entrar-como?volver=1       la sesión prestada vuelve a ser la de Dirección
//
// Las dos contestan JSON con `destino`, y el navegador hace una navegación COMPLETA (no
// `router.refresh()`): cambió la identidad de la sesión, y todo lo que el router del cliente tenía en
// caché es de otra persona. El porqué del diseño entero está en `lib/auth/entrar-como.ts`.
//
// ═══ SIEMPRE ES UN POST ═══
//
// A diferencia de la lente, esto CAMBIA la sesión: un GET que abre la sesión de otro con sólo visitar
// una URL es un enlace que alguien puede mandar. Y con la lente puesta el middleware rechaza los POST,
// así que `/entrar-como` pasa antes de ese corte (ver `middleware.ts`): entrar apaga la lente.

const ATRIBUTOS = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' }

type Sesion = Awaited<ReturnType<typeof createClient>>

/** Cierra la sesión actual en el servidor de Auth y canjea un enlace mágico —que nunca viaja— por la sesión de `email`. */
async function cambiarDeSesion(sesion: Sesion, admin: SupabaseClient, email: string): Promise<string | null> {
  const { data: enlace, error: eErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (eErr || !enlace?.properties?.hashed_token) return eErr?.message ?? 'No pude generar el acceso.'
  // La sesión que se deja se CIERRA en el servidor (`scope: 'local'` = sólo ésta): no queda una
  // sesión huérfana abierta a nombre de quien ya no está mirando.
  await sesion.auth.signOut({ scope: 'local' })
  const { error: vErr } = await sesion.auth.verifyOtp({ token_hash: enlace.properties.hashed_token, type: 'magiclink' })
  return vErr ? vErr.message : null
}

/** Las cookies derivadas de la identidad anterior se borran: rol cacheado, lente y dos pasos. */
function olvidarIdentidadAnterior(respuesta: NextResponse) {
  for (const nombre of [COOKIE_ROL, COOKIE_VER_COMO, COOKIE_MFA]) {
    respuesta.cookies.set(nombre, '', { ...ATRIBUTOS, maxAge: 0, expires: new Date(0) })
  }
}

const rechazo = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { 'cache-control': 'no-store' } })

export async function POST(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const sesion = await createClient()
  const user = await getUsuarioActual(sesion)
  if (!user) return rechazo('Tenés que iniciar sesión.', 401)
  const secreto = secretoDelRol()
  if (!secreto) return rechazo('Falta el secreto con el que se firma la entrada.', 500)

  let admin: SupabaseClient
  try {
    admin = createAdminClient()
  } catch (e) {
    return rechazo(e instanceof Error ? e.message : 'Falta la clave de servicio.', 500)
  }

  // ── VOLVER ─────────────────────────────────────────────────────────────────────────────────────
  if (params.has('volver')) {
    const cookie = (await cookies()).get(COOKIE_ENTRAR_COMO)?.value
    const entrada = await leerEntrarComo(cookie, { uidSesion: user.id }, secreto)
    if (!entrada) return rechazo('Esta sesión no es una sesión prestada: no hay a dónde volver.', 400)

    const { data: direccion } = await admin.auth.admin.getUserById(entrada.direccionId)
    const { data: perfilDir } = await admin.from('perfiles').select('rol').eq('id', entrada.direccionId).maybeSingle()
    // Se cierra la huella ANTES de cambiar de sesión: si el canje fallara, la vuelta igual quedó pedida.
    await admin.from('auditoria_entrar_como').update({ volvio_en: new Date().toISOString() })
      .eq('id', entrada.auditoriaId).is('volvio_en', null)

    const respuesta = NextResponse.json({ ok: true, destino: '/' }, { headers: { 'cache-control': 'no-store' } })
    respuesta.cookies.set(COOKIE_ENTRAR_COMO, '', { ...ATRIBUTOS, maxAge: 0, expires: new Date(0) })
    olvidarIdentidadAnterior(respuesta)

    // Si la cuenta de Dirección ya no es Dirección o está bloqueada, no se le abre sesión: se cierra
    // la prestada y se va al login. Es el modo de fallar cerrado.
    const dirRol = (perfilDir as { rol?: string } | null)?.rol
    if (!direccion?.user?.email || dirRol !== ROL_QUE_ENTRA || estadoDeCuenta(direccion.user) !== 'activo') {
      await sesion.auth.signOut({ scope: 'local' })
      return NextResponse.json({ ok: true, destino: '/login?cerraste=1' }, { headers: respuesta.headers })
    }
    const error = await cambiarDeSesion(sesion, admin, direccion.user.email)
    if (error) return rechazo(`No pude volver a tu cuenta: ${error}. Cerrá sesión y volvé a entrar.`, 500)
    return respuesta
  }

  // ── ENTRAR ─────────────────────────────────────────────────────────────────────────────────────
  const objetivoId = params.get('usuario')
  if (!objetivoId) return rechazo('Falta la cuenta a la que entrar.', 400)

  // EL ROL SE PREGUNTA A LA BASE, con la sesión de quien llama: es la única decisión de este circuito
  // que amplía algo, así que se paga el viaje.
  const { data: perfilActor } = await sesion.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
  const rolActor = (perfilActor as { rol?: Rol } | null)?.rol ?? null
  if (rolActor !== ROL_QUE_ENTRA) return rechazo('Sólo Dirección puede entrar como otro usuario.', 403)
  if (objetivoId === user.id) return rechazo('Ya estás en tu cuenta.', 400)

  const { data: objetivo } = await admin.auth.admin.getUserById(objetivoId)
  if (!objetivo?.user?.email) return rechazo('Esa cuenta no existe o no tiene correo.', 404)
  const { data: perfilObj } = await admin.from('perfiles').select('rol').eq('id', objetivoId).maybeSingle()
  const rolObjetivo = (perfilObj as { rol?: Rol } | null)?.rol ?? null
  if (!puedeEntrarComo(rolActor, rolObjetivo)) return rechazo('Nadie entra como otra cuenta de Dirección.', 403)
  if (estadoDeCuenta(objetivo.user) !== 'activo') return rechazo('Esa cuenta no tiene acceso: no se le puede abrir sesión.', 409)

  // LA HUELLA VA PRIMERO. Si no se puede escribir, no se entra: una sesión prestada sin registro no
  // existe para este sistema.
  const { data: huella, error: hErr } = await admin.from('auditoria_entrar_como').insert({
    direccion_id: user.id,
    objetivo_id: objetivoId,
    objetivo_rol: rolObjetivo,
    user_agent: request.headers.get('user-agent')?.slice(0, 400) ?? null,
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  }).select('id').single()
  if (hErr || !huella) return rechazo(`No pude registrar la entrada, así que no entré: ${hErr?.message ?? 'sin id'}`, 500)

  const error = await cambiarDeSesion(sesion, admin, objetivo.user.email)
  if (error) {
    await admin.from('auditoria_entrar_como').update({ volvio_en: new Date().toISOString(), motivo: `falló el canje: ${error}` }).eq('id', huella.id)
    return rechazo(`No pude abrir la sesión de esa cuenta: ${error}`, 500)
  }

  const respuesta = NextResponse.json({ ok: true, destino: '/' }, { headers: { 'cache-control': 'no-store' } })
  olvidarIdentidadAnterior(respuesta)
  respuesta.cookies.set(
    COOKIE_ENTRAR_COMO,
    await sellarEntrarComo({ direccionId: user.id, objetivoId, auditoriaId: huella.id as string }, secreto),
    { ...ATRIBUTOS, maxAge: VIDA_ENTRAR_COMO_SEGUNDOS },
  )
  return respuesta
}
