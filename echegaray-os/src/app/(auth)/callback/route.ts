import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { RUTA_RECUPERAR, destinoSeguro } from '@/features/auth/services/recuperacion'
import { completarIngresoPortal } from '@/features/portal/services/portalAuth'

// LA VUELTA DEL CORREO — el único lugar del OS donde un enlace se convierte en sesión.
//
// Supabase manda a esta ruta con `?code=…` (flujo PKCE). El canje tiene que pasar por un Route
// Handler y no por una pantalla: `exchangeCodeForSession` ESCRIBE la cookie de sesión, y un Server
// Component no puede escribir cookies — `createClient` se traga ese `set` en un `try/catch` y el
// canje "funcionaría" sin dejar sesión, que es el peor de los dos modos de fallar.
//
// ═══ LO QUE ESTA RUTA NO HACE ═══
//
// No decide qué puede ver la persona. La sesión que crea es la de siempre y el middleware, el RBAC y
// el RLS siguen mandando igual. Lo único propio es a dónde la manda después, y eso pasa por
// `destinoSeguro` para que un `?next=//otrodominio.com` no convierta esta URL en un trampolín.
//
// ═══ NO SE DISTINGUE POR QUÉ FALLÓ ═══
//
// Sin código, con un código vencido o con uno ya usado, la persona termina en el mismo lado: la
// pantalla de recuperación, diciendo que el enlace no sirve más y ofreciendo pedir otro. Las tres
// causas se arreglan con la misma acción, así que separarlas sólo agrega texto para leer.

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const vencido = new URL(`${RUTA_RECUPERAR}?vencido=1`, origin)

  // Supabase también vuelve por acá cuando el enlace ya no sirve, pero con `error` en vez de `code`.
  if (!code || searchParams.get('error')) return NextResponse.redirect(vencido)

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(vencido)

  // ═══ EL CLIENTE DEL PORTAL SE ATA ACÁ, NO EN UNA PANTALLA (25/08/2026) ═══
  //
  // Éste es el primer momento en que existe un `auth.users` para el cliente, así que es el único
  // lugar donde se puede completar `cliente_acceso.auth_user_id` y crear su `perfiles` con rol
  // `cliente`. Hacerlo en la pantalla del portal sería tarde: el middleware la evalúa ANTES de que
  // esa pantalla corra, vería un usuario sin rol y lo rebotaría — un bucle de redirección para
  // alguien que entró bien.
  //
  // Es idempotente y silencioso para los empleados: quien no tiene fila en `cliente_acceso` no es
  // asunto del portal y sigue de largo por el camino de siempre.
  const portal = await completarIngresoPortal()
  if (portal.ok && portal.id) return NextResponse.redirect(new URL('/portal', origin))
  if (!portal.ok) {
    // Acceso revocado o mail ya atado a otra cuenta: `completarIngresoPortal` ya cerró la sesión.
    // Se le dice por qué en la puerta del portal, que es de donde vino.
    const rechazo = new URL('/portal/ingresar', origin)
    rechazo.searchParams.set('error', portal.error)
    return NextResponse.redirect(rechazo)
  }

  // `origin` y no `siteUrl()`: la persona ya está parada en este host —quien abrió el correo llegó
  // acá— y devolverla a otro dominio le pediría entrar de nuevo con la sesión recién creada del
  // otro lado. La ruta interna es la que se valida; el host es el que ya estaba usando.
  return NextResponse.redirect(new URL(destinoSeguro(searchParams.get('next')), origin))
}
