import type { ButtonHTMLAttributes, ReactNode } from 'react'
import Link from 'next/link'

// LAS ACCIONES — `design/system/COMPONENTS.md` §Buttons, `INTERACTION.md` §Acciones.
//
// UNA PRIMARIA POR CONTEXTO. La primaria es el amarillo de la marca con texto GRAFITO: #FDC900 da
// 1,6:1 sobre blanco y no admite texto claro encima, así que el par (fondo amarillo, texto #1F1F1E)
// no es una opción entre varias — es la única combinación legible que existe con este color.
//
// Que la primaria sea el color de marca y aparezca UNA vez por pantalla es lo que la hace señal:
// dos botones amarillos en la misma vista no son dos acciones importantes, son ninguna.

type Variante = 'primaria' | 'secundaria' | 'discreta' | 'destructiva'

const VARIANTE: Record<Variante, string> = {
  primaria: 'bg-marca text-[color:var(--os-on-marca)] font-semibold hover:brightness-[0.97]',
  secundaria: 'border border-line bg-surface text-ink hover:bg-surface-quiet',
  discreta: 'text-muted hover:bg-surface-quiet hover:text-ink',
  destructiva: 'text-neg hover:bg-neg-soft',
}

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-control px-3.5 py-[7px] text-[13px] leading-[18px] transition-colors disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-faint disabled:hover:brightness-100'

export function Boton({
  variante = 'secundaria',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return <button {...props} className={`${BASE} ${VARIANTE[variante]} ${className}`} />
}

export function BotonEnlace({
  href,
  variante = 'secundaria',
  className = '',
  children,
  ...props
}: {
  href: string
  variante?: Variante
  className?: string
  children: ReactNode
} & Omit<React.ComponentProps<typeof Link>, 'href' | 'className'>) {
  return (
    <Link href={href} {...props} className={`${BASE} ${VARIANTE[variante]} ${className}`}>
      {children}
    </Link>
  )
}

/** El `← volver` del encabezado de entidad. 12px muted, sin caja: es una migaja, no un botón. */
export function Volver({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      data-testid="volver"
      className="inline-flex items-center gap-1 text-[12px] text-muted transition-colors hover:text-ink"
    >
      <span aria-hidden>←</span>
      {children}
    </Link>
  )
}
