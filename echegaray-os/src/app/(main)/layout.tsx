import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { ROL_LABEL } from '@/features/auth/types'
import { LogoutButton } from '@/features/auth/components/LogoutButton'
import { NavLink } from '@/shared/components/NavLink'

// LA NAVEGACIÓN DEL OS — 17/08/2026.
//
// El dueño: *"saca todo, pone solo lo nuevo"*. Salieron de la experiencia las 27 pantallas legacy
// (dashboard, obras viejo, caja, personas, organización…) que colgaban de tablas congeladas el
// 09/07 o directamente vacías: 198 archivos borrados, backend y workers intactos.
//
// **01 · Obras** encabeza porque es el primer módulo definitivo del Business OS y porque la obra es
// el eje del negocio. Lo que queda debajo no es legacy: son las pantallas que leen dato fresco y
// verificado (ingeniería financiera se recalcula todos los días, integraciones sincroniza cada 5
// minutos). Cuando cada una se convierta en módulo, sube.
//
// Regla para el que agregue el próximo: un link acá es un compromiso de que la pantalla muestra
// dato real. Si no lo muestra, no va al nav — va al backlog.
const GRUPOS_NAV = [
  {
    grupo: '01 · Obras',
    links: [
      { href: '/obras', label: 'Portafolio' },
      { href: '/control-obras', label: 'Pedidos y herramientas' },
    ],
  },
  {
    grupo: 'OS',
    links: [
      { href: '/os', label: 'Centro de Operación' },
      { href: '/chat', label: 'Chat del OS' },
      { href: '/aprobaciones', label: 'Aprobaciones' },
    ],
  },
  {
    grupo: 'Finanzas',
    links: [
      { href: '/ingenieria-financiera', label: 'Ingeniería Financiera' },
      { href: '/calendario-financiero', label: 'Calendario Financiero' },
      { href: '/scorecard-finanzas', label: 'Scorecard Admin/Finanzas' },
      { href: '/calendario-caja', label: 'Scorecard' },
      { href: '/flujo-caja', label: 'Flujo de Caja' },
    ],
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
      { href: '/integraciones/herramientas', label: 'Herramientas' },
      { href: '/integraciones/movimientos', label: 'Movimientos' },
      { href: '/descargas', label: 'Descargar extensión' },
    ],
  },
] as const

async function loadUsuario() {
  try {
    const supabase = await createClient()
    const user = await getUsuarioActual(supabase)
    if (!user) return { email: null, rolLabel: null, rol: null }
    const perfil = await getPerfilActual(supabase)
    return {
      email: user.email ?? null,
      rolLabel: perfil.data ? ROL_LABEL[perfil.data.rol] : 'Sin rol asignado',
      rol: perfil.data?.rol ?? null,
    }
  } catch {
    return { email: null, rolLabel: null, rol: null }
  }
}

// El campo (operario) ve una navegación mínima: solo sus módulos operativos.
const NAV_CAMPO = [
  {
    grupo: 'Campo',
    links: [
      { href: '/campo', label: 'Inicio' },
      { href: '/integraciones/pedidos-materiales', label: 'Pedidos' },
      { href: '/integraciones/herramientas', label: 'Herramientas' },
      { href: '/integraciones/movimientos', label: 'Movimientos' },
      { href: '/descargas', label: 'Descargar extensión' },
    ],
  },
] as const

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { email, rolLabel, rol } = await loadUsuario()
  const grupos =
    rol === 'campo'
      ? NAV_CAMPO
      : rol === 'direccion'
        ? [...GRUPOS_NAV, { grupo: 'Administración', links: [{ href: '/operarios', label: 'Operarios' }] }]
        : GRUPOS_NAV

  return (
    <div className="min-h-screen">
      <nav className="border-b bg-white" data-testid="nav-areas">
        <div className="flex flex-wrap items-start justify-between gap-3 p-3 text-sm">
          <div className="flex flex-wrap items-start gap-4">
            {grupos.map(({ grupo, links }) => (
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
