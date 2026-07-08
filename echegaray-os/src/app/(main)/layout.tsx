import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { ROL_LABEL } from '@/features/auth/types'
import { LogoutButton } from '@/features/auth/components/LogoutButton'
import { NavLink } from '@/shared/components/NavLink'

// PR UX-1: navegación por trabajo real, no por feature técnica. Antes: 14 links
// planos mezclando áreas de negocio con herramientas internas del propio OS (Motor de
// Decisiones, Rutinas, Backlog Autónomo como links sueltos al mismo nivel que "Caja").
// Ahora: 8 grupos según quién los usa y para qué -- Motor de Decisiones/Rutinas/
// Backlog Autónomo pasan a ser secciones de una sola página ("Operador Digital"), no
// links de primer nivel. Comercial y Compras se sacan del nav (sin datos reales
// todavía -- nivel 1 y "sin uso real" en el scorecard) pero siguen accesibles por URL
// directa, no se borran.
const GRUPOS_NAV = [
  {
    grupo: 'Dirección',
    links: [
      { href: '/dashboard', label: 'Dirección' },
      { href: '/acciones', label: 'Centro de Acción' },
    ],
  },
  {
    grupo: 'Finanzas',
    links: [
      { href: '/caja', label: 'Caja' },
      { href: '/capital-trabajo', label: 'Capital de Trabajo' },
      { href: '/obligaciones', label: 'Obligaciones' },
    ],
  },
  {
    grupo: 'Obras',
    links: [{ href: '/obras', label: 'Obras' }],
  },
  {
    grupo: 'Operación',
    links: [{ href: '/operacion', label: 'Operación' }],
  },
  {
    grupo: 'Administración',
    links: [
      { href: '/administracion', label: 'Administración' },
      { href: '/personas', label: 'Personas' },
    ],
  },
  {
    grupo: 'Recursos',
    links: [{ href: '/equipos', label: 'Equipos' }],
  },
  {
    grupo: 'Operador Digital',
    links: [{ href: '/operador-digital', label: 'Operador Digital' }],
  },
  {
    grupo: 'Sistema',
    links: [
      { href: '/scorecard', label: 'Scorecard' },
      { href: '/preguntas-negocio', label: 'Preguntas de Negocio' },
      { href: '/fuentes', label: 'Fuentes' },
    ],
  },
] as const

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
        <div className="flex flex-wrap items-start justify-between gap-3 p-3 text-sm">
          <div className="flex flex-wrap items-start gap-4">
            {GRUPOS_NAV.map(({ grupo, links }) => (
              <div key={grupo} className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">{grupo}</span>
                <div className="flex flex-wrap gap-1">
                  {links.map((link) => (
                    <NavLink key={link.href} href={link.href}>
                      {link.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs whitespace-nowrap text-gray-600" data-testid="usuario-actual">
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
      </nav>
      <main>{children}</main>
    </div>
  )
}
