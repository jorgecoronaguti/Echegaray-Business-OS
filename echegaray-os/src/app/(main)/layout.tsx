import Link from 'next/link'
import { AREAS_OS, AREA_LABEL, AREA_RUTA } from '@/features/areas/types'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { ROL_LABEL } from '@/features/auth/types'
import { LogoutButton } from '@/features/auth/components/LogoutButton'
import { NavLink } from '@/shared/components/NavLink'

// Grupos con etiqueta visible (heurística "coincidencia entre el sistema y el mundo
// real" + "reconocer antes que recordar"): Áreas = trabajo operativo por rol, Sistema
// = herramientas de observación/autonomía del propio OS. Antes eran 14 links planos
// sin jerarquía ni agrupación -- imposible de escanear de un vistazo.
const SISTEMA_LINKS = [
  { href: '/acciones', label: 'Centro de Acción' },
  { href: '/scorecard', label: 'Scorecard' },
  { href: '/preguntas-negocio', label: 'Preguntas de Negocio' },
  { href: '/backlog-autonomo', label: 'Backlog Autónomo' },
  { href: '/motor-decisiones', label: 'Motor de Decisiones' },
  { href: '/rutinas', label: 'Rutinas' },
  { href: '/fuentes', label: 'Fuentes' },
  { href: '/equipos', label: 'Equipos' },
]

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
        <div className="flex flex-col gap-2 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs font-semibold tracking-wide text-gray-400 uppercase">Áreas</span>
              {AREAS_OS.map((area) => (
                <NavLink key={area} href={AREA_RUTA[area]}>
                  {AREA_LABEL[area]}
                </NavLink>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600" data-testid="usuario-actual">
              {email ? (
                <>
                  <span>
                    {email} · {rolLabel}
                  </span>
                  <LogoutButton />
                </>
              ) : (
                <Link href="/login" className="rounded px-3 py-1 hover:bg-gray-100">
                  Ingresar
                </Link>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1 border-t pt-2">
            <span className="mr-1 text-xs font-semibold tracking-wide text-gray-400 uppercase">Sistema</span>
            {SISTEMA_LINKS.map((link) => (
              <NavLink key={link.href} href={link.href}>
                {link.label}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  )
}
