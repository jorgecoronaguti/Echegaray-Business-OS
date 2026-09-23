import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MarcoAuth } from '@/features/auth/components/MarcoAuth'
import { SegundoPasoForm } from '@/features/auth/components/SegundoPasoForm'
import { destinoSeguro } from '@/features/auth/services/recuperacion'

// EL SEGUNDO PASO AL ENTRAR — la pantalla del código.
//
// Se llega con una sesión `aal1` de una cuenta que tiene dos pasos: la manda `loginAction` recién
// entrada, o el middleware si alguien intenta saltearla escribiendo otra URL. Sin sesión no hay nada
// que verificar y se vuelve al login; con la sesión ya en `aal2` no hay nada que pedir y se sigue.
//
// `?volver=` es la ruta que se quería abrir: entrada de usuario, pasa por `destinoSeguro`.

export const dynamic = 'force-dynamic'

export default async function DosPasosPage({ searchParams }: { searchParams: Promise<{ volver?: string }> }) {
  const { volver } = await searchParams
  const destino = destinoSeguro(volver ?? '/')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (nivel?.currentLevel === 'aal2' || nivel?.nextLevel !== 'aal2') redirect(destino)

  return (
    <MarcoAuth
      titulo="Un paso más"
      bajada={`Tu cuenta tiene verificación en dos pasos. Abrí la app de códigos y escribí el de ${user.email ?? 'esta cuenta'}.`}
    >
      <SegundoPasoForm destino={destino} />
    </MarcoAuth>
  )
}
