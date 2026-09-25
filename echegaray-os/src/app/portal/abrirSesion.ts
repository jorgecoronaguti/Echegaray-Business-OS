import 'server-only'
import { cookies, headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { armarCookie, MARCA_CLIENTE, NOMBRE_COOKIE, OPCIONES_MARCA } from './sesion'

// ABRE LA SESIÓN DEL PORTAL DESDE EL ENLACE PERSONAL (opcional): marca el ingreso, lo anota y firma la cookie.
//
// La entrada normal del cliente es `/portal/login` con su mail (decisión del dueño del 26/08, ratificada el
// 25/09: «ese portal y su url es la que no tenía que cambiarse porque la usan»); esa vive en
// `login/acciones.ts`. Esto lo usa sólo `/portal/ingresar?t=`, el enlace que Administración PUEDE copiar
// desde la ficha como atajo. No es `'use server'`: no se puede invocar desde el navegador.
//
// El orden importa: las dos escrituras van ANTES de la cookie; `primer_ingreso_at` sólo si estaba vacío.

export async function abrirSesionDelPortal(acceso: { accesoId: string; clienteId: string }, mail: string): Promise<void> {
  const sb = createAdminClient()
  const ahora = new Date().toISOString()

  const { data: previo } = await sb
    .from('cliente_acceso').select('primer_ingreso_at').eq('id', acceso.accesoId).maybeSingle()
  const primero = previo?.primer_ingreso_at ?? null

  await sb.from('cliente_acceso').update({
    primer_ingreso_at: primero ?? ahora,
    ultimo_ingreso_at: ahora,
    ultimo_dispositivo: (await headers()).get('user-agent')?.slice(0, 300) ?? null,
  }).eq('id', acceso.accesoId)

  await sb.from('cliente_actividad_portal').insert({
    cliente_id: acceso.clienteId,
    acceso_id: acceso.accesoId,
    tipo: 'ingreso',
    detalle: primero ? 'ingreso al portal con su enlace' : 'primer ingreso al portal con su enlace',
  })

  const { valor, maxAge } = armarCookie({ mail, clienteId: acceso.clienteId })
  ;(await cookies()).set(MARCA_CLIENTE, '1', { ...OPCIONES_MARCA, secure: process.env.NODE_ENV === 'production', maxAge })
  ;(await cookies()).set(NOMBRE_COOKIE, valor, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/portal', maxAge,
  })
}
