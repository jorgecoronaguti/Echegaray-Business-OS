import 'server-only'
import { cookies, headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { armarCookie, NOMBRE_COOKIE } from './sesion'

// ABRE LA SESIÓN DEL PORTAL: marca el ingreso en el acceso, lo anota en el libro y firma la cookie.
//
// Vivía dentro de `login/acciones.ts`. Sale a un módulo `server-only` que NO es `'use server'`: en un
// archivo de acciones, toda función exportada es invocable desde el navegador, y ésta abre una sesión
// para el acceso que se le pase. La llama sólo la ruta del enlace personal, después de comprobarlo.
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
  ;(await cookies()).set(NOMBRE_COOKIE, valor, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/portal', maxAge,
  })
}
