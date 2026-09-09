'use client'

// EL CHIP «OC ·11» QUE ABRE EL PANEL, DENTRO DE UNA FILA QUE YA ES UN ENLACE.
//
// `preventDefault` + `stopPropagation` son obligatorios y no una precaución: el botón está adentro
// del `<Link>` de la obra, y sin cortar el evento un clic en el chip navegaría a la obra —el chip
// parecería roto— además de abrir el panel.

import { useRouter } from 'next/navigation'
import type { CSSProperties } from 'react'

export function BotonOrdenes({
  rotulos, href, className, estilo,
}: {
  rotulos: string[]
  href: string
  className?: string
  estilo: CSSProperties
}) {
  const router = useRouter()
  if (!rotulos.length) return null
  return (
    <button
      type="button"
      data-testid="chip-orden"
      aria-label={`Ver las órdenes: ${rotulos.join(' ')}`}
      className={className}
      style={{ ...estilo, textDecoration: 'underline', textUnderlineOffset: 3 }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(href) }}
    >
      {rotulos.join(' · ')}
    </button>
  )
}
