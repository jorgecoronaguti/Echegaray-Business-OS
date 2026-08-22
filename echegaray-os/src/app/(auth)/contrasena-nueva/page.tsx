import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { MarcoAuth } from '@/features/auth/components/MarcoAuth'
import { ContrasenaNuevaForm } from '@/features/auth/components/ContrasenaNuevaForm'

// M01 · LA CONTRASEÑA NUEVA — el final del enlace del correo.
//
// ═══ SIN SESIÓN NO SE DIBUJA EL FORMULARIO ═══
//
// A esta pantalla se llega con la sesión que dejó `/callback`. Si alguien la abre a mano, o el
// enlace ya se usó, no hay sesión: mostrar igual los dos campos sería ofrecer un trabajo que la
// acción va a rechazar después de tipearlo dos veces. Se lo manda directo a pedir otro enlace.
//
// Es una comprobación de PANTALLA, no la cerradura: `contrasenaNuevaAction` vuelve a preguntar quién
// llama, y `updateUser` sin sesión lo rechaza Supabase venga de donde venga.
//
// Esta ruta SÍ está en `RUTAS_PUBLICAS` desde el QA del 21/08: el enlace vencido llega SIN sesión,
// y con sesión exigida el middleware lo mandaba a /login antes de que esta página pudiera decir
// «pedí otro enlace» (que es lo único que puede hacer sin sesión — `updateUser` la exige igual).
// Y también está en `CAMPO_RUTAS_PERMITIDAS`: sin eso el middleware rebota al operario a `/hoy`
// con la contraseña vieja todavía puesta, que es el caso más común de todos.

export const dynamic = 'force-dynamic'

export default async function ContrasenaNuevaPage() {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/recuperar?vencido=1')

  return (
    <MarcoAuth
      titulo="Poné una contraseña nueva"
      bajada={`Para ${user.email ?? 'tu cuenta'}. Con esta vas a entrar de ahora en más.`}
    >
      <ContrasenaNuevaForm />
    </MarcoAuth>
  )
}
