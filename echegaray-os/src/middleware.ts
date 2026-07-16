import { createServerClient, type SetAllCookies } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { esRutaCampoPermitida } from '@/features/auth/types'

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

  const { data: { user } } = await supabase.auth.getUser()

  // RBAC de campo: un operario (rol 'campo') solo puede ver las rutas operativas. Si intenta
  // entrar a cualquier otra (caja, reportes, dirección…), lo mandamos a su pantalla de campo.
  const pathname = request.nextUrl.pathname
  const esApiOAuth = pathname.startsWith('/api') || pathname.startsWith('/login') || pathname.startsWith('/signup')
  if (user && !esApiOAuth && !esRutaCampoPermitida(pathname)) {
    const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
    if (perfil?.rol === 'campo') {
      const url = request.nextUrl.clone()
      url.pathname = '/campo'
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
