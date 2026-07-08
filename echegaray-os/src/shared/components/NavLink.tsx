'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Resalta el link de la sección donde el usuario ya está -- wayfinding básico
// (heurística de Nielsen "visibilidad del estado del sistema"). Antes ningún link de
// la navegación indicaba en qué página estabas.
export function NavLink({
  href,
  className = '',
  activeClassName = 'bg-gray-900 text-white hover:bg-gray-900',
  children,
}: {
  href: string
  className?: string
  activeClassName?: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'))

  return (
    <Link href={href} className={`rounded px-3 py-1 hover:bg-gray-100 ${active ? activeClassName : className}`}>
      {children}
    </Link>
  )
}
