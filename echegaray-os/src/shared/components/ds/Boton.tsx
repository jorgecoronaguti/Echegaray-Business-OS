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

// Todo lo que NO es tamaño. Se separó del tamaño el 21/08/2026: pegarle un `className` con otro
// alto a una constante que ya trae `px-3.5 py-[7px] text-[12.5px]` deja dos reglas del mismo grupo
// compitiendo, y sin `tailwind-merge` gana la que Tailwind ordene en el CSS, no la que se escribió
// último. Es decir: a veces. Un botón que mide bien «a veces» es peor que uno que mide mal siempre.
const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-control transition-colors disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-faint disabled:hover:brightness-100'

/**
 * LOS DOS TAMAÑOS.
 *
 * `normal` — 7×14 de padding y 12,5px, medido del especimen
 * (`design/screens/visual/DesignSystem.dc.html` §05). Es el botón del escritorio.
 *
 * `bloque` — 48px de alto y ancho completo. NO es «el mismo botón más grande»: es la acción del día
 * del teléfono, la que va fija abajo, y `LAYOUT_RESPONSIVE.md` §Mobile la fija en 48px porque se
 * toca parado, en obra, muchas veces con guante. Existe acá y no en cada perfil porque el jefe de
 * obra y el empleado ya habían dibujado su propia versión de lo mismo un píxel distinto.
 *
 * La deshabilitada CONSERVA el peso: lo que la apaga es el par fondo hundido + texto faint, no
 * adelgazarla — una primaria que además cambia de peso al deshabilitarse se lee como otro botón.
 */
export type TamanoBoton = 'normal' | 'bloque'

const TAMANO: Record<TamanoBoton, string> = {
  normal: 'px-3.5 py-[7px] text-[12.5px] leading-[18px]',
  bloque: 'h-[48px] w-full rounded-[12px] px-4 text-[15px]',
}

export function Boton({
  variante = 'secundaria',
  tamano = 'normal',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; tamano?: TamanoBoton }) {
  return <button {...props} className={`${BASE} ${TAMANO[tamano]} ${VARIANTE[variante]} ${className}`} />
}

export function BotonEnlace({
  href,
  variante = 'secundaria',
  tamano = 'normal',
  className = '',
  children,
  ...props
}: {
  href: string
  variante?: Variante
  tamano?: TamanoBoton
  className?: string
  children: ReactNode
} & Omit<React.ComponentProps<typeof Link>, 'href' | 'className'>) {
  return (
    <Link href={href} {...props} className={`${BASE} ${TAMANO[tamano]} ${VARIANTE[variante]} ${className}`}>
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
