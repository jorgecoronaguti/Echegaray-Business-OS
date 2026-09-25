// LOS CINCO ÍCONOS DE LA CABECERA DE UNA CARTERA, con el trazo de Obras (`obras/components/canon/Ico.tsx`).
//
// Copiados path por path de `P.buscar`, `P.cerrar`, `P.mas`, `P.todo` y `P.hh`: `shared` no importa de
// una feature, y los íconos de `shared/components/iconos.tsx` van con trazo 1,6 —al lado de Obras, que
// dibuja con 2, la misma lupa se ve más flaca—. Sin estado ni `'use client'`: se dibuja en el servidor.

import type { ReactNode } from 'react'

export const TRAZOS_CARTERA = {
  buscar: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.3-4.3" /></>,
  cerrar: <path d="M6 6l12 12M18 6L6 18" />,
  mas: <path d="M12 5v14M5 12h14" />,
  todo: <path d="M4 6h16M4 12h16M4 18h16" />,
  hh: <><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4.5l3 2" /></>,
} as const satisfies Record<string, ReactNode>

export function IcoCartera({ d, s = 14, className }: { d: keyof typeof TRAZOS_CARTERA; s?: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden
      className={className} style={{ display: 'block', flexShrink: 0 }}>
      {TRAZOS_CARTERA[d]}
    </svg>
  )
}
