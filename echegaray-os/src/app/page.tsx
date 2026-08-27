import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { destinoDeLaHome } from '@/features/auth/types/navegacion'
import { getPerfilActual } from '@/features/auth/services/authService'

// LA RAÍZ — «inicio» tiene que significar algo distinto para cada nivel.
//
// El 09/07/2026 esto mandaba a `/flujo-caja` para todo el mundo: *"el OS se enfoca en Flujo de Caja
// — el home es el espejo del Sheet"*. Esa decisión se conserva para quien ve economía, pero era la
// única: un jefe de obra rebotaba en `RUTAS_SOLO_ECONOMIA` y hacía dos saltos hasta `/obras`, y un
// empleado tres hasta `/hoy`. Cuál es el inicio de cada rol lo decide `destinoDeLaHome`, que es
// puro y está probado; acá sólo se averigua quién entró.
export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Sin perfil se cae al nivel MENOS privilegiado, igual que la navegación: el modo de fallar de un
  // default permisivo acá es aterrizar a alguien en la pantalla del dinero.
  const { data: perfil } = await getPerfilActual(supabase, user.id)
  redirect(destinoDeLaHome(perfil?.rol))
}
