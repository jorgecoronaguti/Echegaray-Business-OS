import Link from 'next/link'
import { AREAS_OS, AREA_LABEL, AREA_RUTA } from '@/features/areas/types'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen">
      <nav className="border-b bg-white" data-testid="nav-areas">
        <div className="flex flex-wrap items-center gap-1 p-3 text-sm">
          {AREAS_OS.map((area) => (
            <Link key={area} href={AREA_RUTA[area]} className="rounded px-3 py-1 hover:bg-gray-100">
              {AREA_LABEL[area]}
            </Link>
          ))}
          <span className="mx-2 text-gray-300">|</span>
          <Link href="/acciones" className="rounded px-3 py-1 font-semibold hover:bg-gray-100">
            Centro de Acción
          </Link>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  )
}
