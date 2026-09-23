import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { secretoDelRol } from '@/lib/auth/rol-cache'
import {
  COOKIE_VER_COMO, ROL_QUE_MIRA, VIDA_VER_COMO_SEGUNDOS, esRolMirable, sellarVerComo,
} from '@/lib/auth/ver-como'

// LA LLAVE DE LA LENTE: prender y apagar «ver como».
//
// ═══ POR QUÉ ES UN GET Y NO UN SERVER ACTION ═══
//
// Porque con la lente puesta el middleware rechaza TODO lo que no sea lectura, y un Server Action es
// un POST. Si apagar la lente fuera un POST, apagarla sería lo único que no se podría hacer con la
// lente puesta — la trampa perfecta. Un GET se puede tocar siempre, desde cualquier rol mirado y
// desde cualquier pantalla, que es exactamente lo que hace falta para que salir sea un solo clic.
//
// ═══ EL ROL SE PREGUNTA A LA BASE, NO A LA COOKIE ═══
//
// El middleware trabaja con `os_rol`, que es una cookie firmada con hasta 5 minutos de atraso. Para
// ENCENDER la lente eso no alcanza: es la única decisión de este circuito que amplía algo (el
// derecho a mirar), así que se paga el viaje y se lee `perfiles`. Apagarla no pregunta nada: apagar
// siempre está permitido.
//
// ═══ LA LENTE SÓLO RESTRINGE ═══
//
// `esRolMirable` deja pasar `administracion`, `jefe_obra` y `campo` — todos ven menos que Dirección.
// No están `direccion` (no haría nada) ni `cliente` (el portal es otra aplicación, con su propia
// sesión firmada: imitarlo desde acá no mostraría el portal, mostraría una pantalla vacía).

/** A dónde volver después. Sólo rutas de esta aplicación: un `volver` que empiece con `//` o con un esquema es un redirect abierto regalado. */
function destinoSeguro(volver: string | null, base: string): URL {
  const limpio = volver && volver.startsWith('/') && !volver.startsWith('//') ? volver : '/'
  return new URL(limpio, base)
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const destino = destinoSeguro(params.get('volver'), request.url)

  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const respuesta = NextResponse.redirect(destino)

  // APAGAR. Sin preguntas, sin rol, sin base: siempre se puede volver a ser uno mismo.
  if (params.has('salir')) {
    // Se borra con los mismos atributos con que se creó: un borrado con atributos distintos puede
    // no tocar la cookie original.
    respuesta.cookies.set(COOKIE_VER_COMO, '', {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0, expires: new Date(0),
    })
    return respuesta
  }

  const rol = params.get('rol')
  if (!esRolMirable(rol)) {
    return NextResponse.json({ error: 'Ese rol no se puede mirar.' }, { status: 400 })
  }

  const { data: perfil } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
  if ((perfil as { rol?: string } | null)?.rol !== ROL_QUE_MIRA) {
    return NextResponse.json({ error: 'Sólo Dirección puede mirar la aplicación como otro rol.' }, { status: 403 })
  }

  const secreto = secretoDelRol()
  if (!secreto) {
    return NextResponse.json({ error: 'Falta el secreto con el que se firma la lente.' }, { status: 500 })
  }

  respuesta.cookies.set(COOKIE_VER_COMO, await sellarVerComo({ uid: user.id, rol }, secreto), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: VIDA_VER_COMO_SEGUNDOS,
  })
  return respuesta
}
