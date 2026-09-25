import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { abrirSesionDelPortal } from '../abrirSesion'
import { hashDeToken, pareceToken } from '@/shared/portal/enlace'

// LA ÚNICA PUERTA DEL CLIENTE AL PORTAL: su enlace personal (25/09/2026). Ver `shared/portal/enlace.ts`.
//
// Un enlace que no existe, que se regeneró o cuyo acceso se revocó manda al ingreso con un aviso — sin
// decir cuál de las tres cosas pasó, para no confirmarle nada a quien prueba enlaces.
//
// Se redirige a `/portal` SIN el token: así no queda en el historial de la pantalla que el cliente usa
// todos los días (el enlace sigue en su mail o su WhatsApp, que es donde tiene que estar). La cookie se
// pone con `cookies()` + `redirect()`, igual que la vista previa.

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t')
  if (!pareceToken(t)) redirect('/portal/login?enlace=vencido')

  const { data: acceso } = await createAdminClient()
    .from('cliente_acceso')
    .select('id, cliente_id, email')
    .eq('enlace_hash', hashDeToken(t))
    .is('revocado_at', null)
    .maybeSingle()
  if (!acceso) {
    console.warn('[portal] enlace de ingreso inexistente, regenerado o revocado')
    redirect('/portal/login?enlace=vencido')
  }

  await abrirSesionDelPortal({ accesoId: String(acceso.id), clienteId: String(acceso.cliente_id) }, String(acceso.email))
  redirect('/portal')
}
