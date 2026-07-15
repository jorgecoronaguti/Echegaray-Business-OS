import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { ROL_LABEL } from '@/features/auth/types'
import { LogoutButton } from '@/features/auth/components/LogoutButton'
import { NavLink } from '@/shared/components/NavLink'

// Decisión de Jorge (2026-07-09): el OS se enfoca exclusivamente en Flujo de Caja.
// El Sheet real "Flujo de Caja - Cash Flow" es la fuente de verdad; la web lo
// refleja en /flujo-caja. Todo lo demás (Dirección, Obras, Operación, Personas,
// Operador Digital, Scorecard...) sale del nav pero NO se borra: cada página
// sigue accesible por URL directa, igual que se hizo con Comercial/Compras en
// UX-1. Si se retoma un módulo, se re-agrega acá su grupo.
const GRUPOS_NAV = [
  {
    grupo: 'OS',
    links: [
      { href: '/os', label: 'Centro de Operación' },
      { href: '/aprobaciones', label: 'Aprobaciones' },
    ],
  },
  {
    grupo: 'Finanzas',
    links: [{ href: '/flujo-caja', label: 'Flujo de Caja' }],
  },
  {
    grupo: 'Reportes',
    links: [{ href: '/reportes', label: 'Reportes' }],
  },
  {
    grupo: 'Conexiones',
    links: [
      { href: '/integraciones', label: 'Integraciones' },
      { href: '/integraciones/pedidos-materiales', label: 'Pedidos de Materiales' },
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
