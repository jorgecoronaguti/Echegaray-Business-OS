'use client'

// LAS PIEZAS QUE COMPARTEN LOS PANELES DE «EFECTIVO A RENDIR» (D02, D05, D06): la cabecera con su ×, el
// campo con su rótulo mono y el error. Escape cierra el panel, como en el resto de la app.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { V, eyebrow } from './estilo'

/** En un teléfono el panel ocupa la pantalla entera. `!` porque el ancho del diseño va inline. */
// `[&>*]:shrink-0`: a pantalla entera el panel es una columna flex de alto fijo y, sin esto, sus hijos se
// encogían en vez de scrollear — el buscador y «Elegí una compra» de «Imputar» medían 20 px (25/09).
export const PANEL_CLASE = 'max-md:fixed max-md:inset-0 max-md:z-40 max-md:!w-full max-md:overflow-y-auto max-md:[&>*]:shrink-0'

export function Cerrar({ titulo, bajada, href, antes }: { titulo: ReactNode; bajada?: ReactNode; href: string; antes?: ReactNode }) {
  const router = useRouter()
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') router.push(href, { scroll: false }) }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [router, href])
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        {antes}
        <div style={{ fontSize: '17px', fontWeight: 600 }}>{titulo}</div>
        {bajada && <div style={{ fontSize: '12.5px', color: V.apagado }}>{bajada}</div>}
      </div>
      <Link href={href} scroll={false} prefetch={false} aria-label="Cerrar" data-testid="cerrar-panel" className="max-md:-mr-3 max-md:-mt-3 max-md:inline-flex max-md:h-12 max-md:w-12 max-md:items-center max-md:justify-center" style={{ fontSize: '20px', color: V.apagado, lineHeight: 1, padding: 4 }}>
        ×
      </Link>
    </div>
  )
}

export function Campo({ rotulo, children }: { rotulo: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={eyebrow}>{rotulo}</div>
      {children}
    </div>
  )
}

export function ErrorPanel({ texto }: { texto: string | null }) {
  if (!texto) return null
  return <div role="alert" data-testid="error-panel" style={{ fontSize: '12.5px', color: V.neg, lineHeight: 1.5 }}>{texto}</div>
}
