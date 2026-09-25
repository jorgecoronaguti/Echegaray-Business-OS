'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NOMBRE_COOKIE } from '../sesion'

// LAS ACCIONES DE LA PUERTA DEL PORTAL.
//
// `entrar` y `entrarComo` SE RETIRARON el 25/09/2026: abrían la sesión de un cliente con sólo escribir
// un mail habilitado. La entrada es ahora el enlace personal (`/portal/ingresar`, ver `shared/portal/enlace.ts`) y
// abrir la sesión vive en `../abrirSesion.ts`, que no es una acción: en un archivo `'use server'` toda
// función exportada se puede invocar desde el navegador.

export async function salir() {
  ;(await cookies()).delete({ name: NOMBRE_COOKIE, path: '/portal' })
  redirect('/portal/chau')
}
