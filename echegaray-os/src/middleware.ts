import { createServerClient, type SetAllCookies } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { esRutaCampoPermitida, esRutaPublica } from '@/features/auth/types'
import { puedeVerRuta } from '@/features/auth/types/areas'
import {
  CLAVE_LIMPIAR, cookieDeVista, queryARestaurar,
} from '@/features/obras/services/vistaRecordada'
import { destinoPorRol } from '@/features/portal/types'

// Refresca la sesión de Supabase en cada request -- sin esto, un usuario logueado
// puede quedar con un token vencido en Server Components y verse "deslogueado" sin
// haber cerrado sesión. Patrón estándar de @supabase/ssr para Next.js App Router.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  // ═══ LA FIRMA SE VERIFICA ACÁ, NO EN SÃO PAULO (25/08/2026) ═══
  //
  // Acá había `auth.getUser()`, que manda un GET a `/auth/v1/user` y espera la respuesta ANTES de
  // dejar pasar el request. Medido contra el Supabase real desde esta VM, mediana de 5 corridas:
  // 76 ms. Y no se paga una vez por pantalla: el matcher cubre el documento, cada payload RSC y
  // cada Server Action. Una sola visita a `/documentos` disparaba 77 pasadas por este archivo
  // (medido el 25/08 con el middleware instrumentado) — 77 × 76 ms de espera pura.
  //
  // El proyecto firma sus JWT con clave ASIMÉTRICA (`alg: ES256`, `kid` presente, JWKS público en
  // `/auth/v1/.well-known/jwks.json` — comprobado el 25/08 decodificando un token real). Con eso,
  // `getClaims()` verifica la firma con WebCrypto contra la clave pública, en el proceso, y sólo sale
  // a la red la primera vez de cada instancia para traer el JWKS: `GLOBAL_JWKS` de auth-js vive en
  // el módulo y lo comparten todos los clientes del mismo proceso.
  //
  // NO ES UNA PUERTA MÁS FLOJA. `getClaims()` rechaza un token con firma inválida
  // (`AuthInvalidJwtError`) y uno vencido (`validateExp`), y si el proyecto volviera a firmar con
  // HS256 la propia librería se cae a `getUser()` sola. Lo que cambia es CUÁNDO se entera de una
  // sesión cerrada a mano: hasta que venza el access token (~1 h) en vez de al instante. Eso ya era
  // así para los datos —PostgREST también valida la firma localmente y nunca le pregunta al servidor
  // de Auth—, así que la ventana no la abre este cambio: la tenía la cerradura, no la puerta. El
  // refresh token sí queda invalidado al instante por `signOut({ scope: 'global' })`.
  const { data: sesion } = await supabase.auth.getClaims()
  const user = sesion?.claims ? { id: sesion.claims.sub } : null
  const pathname = request.nextUrl.pathname

  // ── SIN SESIÓN NO SE VE NADA. Es lo primero que se decide, antes que cualquier rol.
  // Hasta el 17/08/2026 esto no existía y `/flujo-caja` respondía 200 a un anónimo con los
  // importes y los nombres de los clientes: esa ruta no pasa por Supabase, lee el Sheet con una
  // service account desde el servidor, así que el RLS —que tapaba al resto— no la cubría.
  // Se guarda a dónde iba para devolverlo ahí después de entrar.
  if (!user && !esRutaPublica(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('volver', pathname)
    return NextResponse.redirect(url)
  }

  // RBAC de campo: un empleado (rol 'campo') solo puede ver las rutas de su perfil y las
  // operativas. Si intenta entrar a cualquier otra (caja, reportes, dirección…), lo mandamos a
  // «Hoy», que desde el 20/08/2026 es su pantalla de inicio: es la que contesta las tres preguntas
  // con las que abre el OS —dónde trabajo, qué tengo que hacer, tengo algo pendiente—.
  // `/signup` salió de la condición el 27/08/2026 junto con la ruta: el alta libre se fue y la
  // gobernada vive en `/administracion/usuarios`, que SÍ pasa por el portero de abajo.
  const esApiOAuth = pathname.startsWith('/api') || pathname.startsWith('/login')
  if (user && !esApiOAuth) {
    const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()

    // ═══ EL PORTAL DEL CLIENTE SE DECIDE PRIMERO (25/08/2026) ═══
    //
    // Antes que el RBAC de campo y antes que las áreas, porque `cliente` no es un empleado con menos
    // permisos: es alguien de OTRA empresa. Las reglas de abajo están escritas para gente de adentro
    // y ninguna de ellas contempla que el usuario no lo sea — un cliente que cayera en la rama de
    // `puedeVerRuta` pasaría a `/obras` en vez de a su portal.
    //
    // El confinamiento es en las DOS direcciones y la segunda suele olvidarse: nadie de adentro
    // entra a `/portal`. Ahí las consultas filtran por `cliente_de_sesion()`, que para un empleado
    // devuelve NULL: vería la pantalla vacía y concluiría que el cliente no tiene nada cargado.
    //
    // ESTO ES LA PUERTA, NO LA CERRADURA. Una llamada directa a PostgREST no pasa por acá: eso lo
    // decide el RLS (`es_cliente()` + `cliente_de_sesion()` en Postgres).
    // La cookie de la vista previa: si está, quien mira ya pasó por la puerta que comprueba la
    // sesión del OS y el permiso económico. Acá sólo se mira que exista.
    const destino = destinoPorRol(perfil?.rol, pathname, request.cookies.has('portal_sesion'))
    if (destino) {
      const url = request.nextUrl.clone()
      url.pathname = destino
      url.search = ''
      return NextResponse.redirect(url)
    }

    if (perfil?.rol === 'campo' && !esRutaCampoPermitida(pathname)) {
      const url = request.nextUrl.clone()
      url.pathname = '/hoy'
      return NextResponse.redirect(url)
    }
    // ── EL NIVEL «OBRAS» NO ENTRA A LO DE ADMINISTRACIÓN (18/08/2026).
    //
    // Dos niveles y sólo dos: Administración (dirección + administración) ve todo; Obras (jefe de
    // obra + campo) trabaja sus obras y no ve clientes, economía global ni finanzas. Ver
    // `features/auth/types/areas.ts`.
    //
    // ESTO ES LA PUERTA, NO LA CERRADURA. Una llamada directa a PostgREST no pasa por acá: eso lo
    // decide el RLS, que filtra por `ve_obra()` en la base. Las dos capas hacen falta — el
    // middleware evita que una pantalla se dibuje vacía y desconcertante; el RLS evita que los datos
    // salgan del servidor. Redirigir sin RLS sería seguridad cosmética.
    if (!puedeVerRuta(perfil?.rol, pathname)) {
      // ═══ /presupuestos PASA, Y SU PÁGINA DICE «SIN PERMISO» (QA 24/08) ═══
      // La página tiene el cartel escrito («sin permiso» ≠ «no hay presupuestos») y este redirect
      // lo convertía en código muerto: un jefe que abría un link compartido aterrizaba en /obras
      // sin explicación. La solapa sigue sin dibujarse para él (la navegación usa puedeVerRuta) y
      // la base sigue cerrada por ve_economia() — esto sólo decide QUÉ pantalla explica el porqué.
      if (pathname === '/presupuestos' || pathname.startsWith('/presupuestos/')) {
        return response
      }
      const url = request.nextUrl.clone()
      url.pathname = '/obras'
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  // ═══ LA VISTA DE OBRAS SE ABRE COMO LA DEJÉ (19/08/2026) ═══
  //
  // El dueño: *"que guarden cuál fue el último filtrado que hice según la columna para que me la
  // muestre de esa manera y no tener que estar poniendo nuevamente cómo quiero verlo"*.
  //
  // ACÁ SÓLO SE RESTAURA. Guardar lo hace el navegador (`components/RecordarVista.tsx`) porque el
  // servidor no puede distinguir una precarga de Next de una navegación real —lo intentamos por
  // cabeceras y se filtraba igual—, y el navegador sí: una precarga trae bytes y no monta nada.
  //
  // Restaurar sigue acá porque la redirección ocurre ANTES de que se dibuje nada: no hay una
  // pintura con el orden equivocado que después se corrige sola.
  const cookieVista = user && request.method === 'GET' ? cookieDeVista(pathname) : null
  if (cookieVista) {
    const params = request.nextUrl.searchParams
    if (params.has(CLAVE_LIMPIAR)) {
      // Volver al estado de fábrica: se olvida y se abre limpia. La cookie se borra ACÁ y no en la
      // pantalla, porque si sobreviviera un instante la redirección la volvería a aplicar.
      const url = request.nextUrl.clone()
      url.search = ''
      const limpia = NextResponse.redirect(url)
      // EL `path` NO SOBRA: la cookie vive en `/obras`, y borrarla sin decirlo borra otra —la de
      // `path: '/'`, que no existe—, así que la preferencia sobrevivía al "quitar filtros".
      limpia.cookies.delete({ name: cookieVista, path: '/obras' })
      return limpia
    }
    const guardada = request.cookies.get(cookieVista)?.value ?? null
    const restaurar = queryARestaurar(params, guardada)
    if (restaurar) {
      const url = request.nextUrl.clone()
      url.search = restaurar
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
