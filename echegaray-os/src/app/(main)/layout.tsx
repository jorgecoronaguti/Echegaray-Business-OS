import Link from 'next/link'
import { AREAS_OS, AREA_LABEL, AREA_RUTA } from '@/features/areas/types'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { ROL_LABEL } from '@/features/auth/types'
import { LogoutButton } from '@/features/auth/components/LogoutButton'

async function loadUsuario() {
  try {
    const supabase = await createClient()
    const user = await getUsuarioActual(supabase)
    if (!user) return { email: null, rolLabel: null }
    const perfil = await getPerfilActual(supabase)
    return {
      email: user.email ?? null,
      rolLabel: perfil.data ? ROL_LABEL[perfil.data.rol] : 'Sin rol asignado',
    }
  } catch {
    return { email: null, rolLabel: null }
  }
}

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { email, rolLabel } = await loadUsuario()

  return (
    <div className="min-h-screen">
      <nav className="border-b bg-white" data-testid="nav-areas">
        <div className="flex flex-wrap items-center justify-between gap-1 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-1">
            {AREAS_OS.map((area) => (
              <Link key={area} href={AREA_RUTA[area]} className="rounded px-3 py-1 hover:bg-gray-100">
                {AREA_LABEL[area]}
              </Link>
            ))}
            <span className="mx-2 text-gray-300">|</span>
            <Link href="/acciones" className="rounded px-3 py-1 font-semibold hover:bg-gray-100">
              Centro de Acción
            </Link>
            <Link href="/scorecard" className="rounded px-3 py-1 font-semibold hover:bg-gray-100">
              Scorecard
            </Link>
            <Link href="/preguntas-negocio" className="rounded px-3 py-1 font-semibold hover:bg-gray-100">
              Preguntas de Negocio
            </Link>
            <Link href="/backlog-autonomo" className="rounded px-3 py-1 font-semibold hover:bg-gray-100">
              Backlog Autónomo
            </Link>
            <Link href="/motor-decisiones" className="rounded px-3 py-1 font-semibold hover:bg-gray-100">
              Motor de Decisiones
            </Link>
            <Link href="/rutinas" className="rounded px-3 py-1 font-semibold hover:bg-gray-100">
              Rutinas
            </Link>
            <Link href="/fuentes" className="rounded px-3 py-1 font-semibold hover:bg-gray-100">
              Fuentes
            </Link>
            <Link href="/equipos" className="rounded px-3 py-1 font-semibold hover:bg-gray-100">
              Equipos
            </Link>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-600" data-testid="usuario-actual">
            {email ? (
              <>
                <span>{email} · {rolLabel}</span>
                <LogoutButton />
              </>
            ) : (
              <Link href="/login" className="rounded px-3 py-1 hover:bg-gray-100">
                Ingresar
              </Link>
            )}
          </div>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  )
}
