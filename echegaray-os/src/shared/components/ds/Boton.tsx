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
  // `text-ink-soft`, no `text-ink`: el especimen §05 dibuja la secundaria con borde en #3A3A38.
  // Un párrafo de razón: la primaria y la secundaria se distinguen por SUPERFICIE (amarillo contra
  // borde), y si además comparten la tinta más oscura del sistema, las dos piden lo mismo. Medio
  // tono menos es lo que la deja leerse como la alternativa y no como la otra mitad de un par.
  secundaria: 'border border-line bg-surface text-ink-soft hover:bg-surface-quiet',
  discreta: 'text-muted hover:bg-surface-quiet hover:text-ink',
  destructiva: 'text-neg hover:bg-neg-soft',
}

// QUIÉN LLEVA BORDE, para compensarlo en el padding (ver `PX`).
const CON_BORDE: Record<Variante, boolean> = {
  primaria: false,
  secundaria: true,
  discreta: false,
  destructiva: false,
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
 * `acceso` — 52px. Es la primaria de las pantallas SIN SESIÓN, y no es «bloque un poco más alto»:
 * `COMPONENTS.md` §Employee shell fija la acción de pantalla en 50–52px, y acá es la ÚNICA cosa
 * tocable que hay —no compite con nada, así que no gana nada por ser chica—. `bloque` se queda en
 * 48 porque lo usan las pantallas del jefe y del empleado, donde la primaria convive con una lista:
 * subirla allá movería tres pantallas de otros frentes para arreglar ésta.
 *
 * La deshabilitada CONSERVA el peso: lo que la apaga es el par fondo hundido + texto faint, no
 * adelgazarla — una primaria que además cambia de peso al deshabilitarse se lee como otro botón.
 *
 * RADIO 8px en los dos tamaños de teléfono, medido del especimen §10 (los tres controles móviles
 * van en `border-radius:8px`). Estaban en 12px, que no es un radio de este sistema: `SPACING_BORDERS`
 * sólo tiene 6 de control y 10 de contenedor, y 12 hacía que la acción del día se leyera como una
 * tarjeta con texto adentro en vez de como el control más grande de la pantalla.
 */
export type TamanoBoton = 'normal' | 'bloque' | 'acceso'

const TAMANO: Record<TamanoBoton, string> = {
  normal: 'py-[7px] text-[12.5px] leading-[18px]',
  bloque: 'h-[48px] w-full rounded-[8px] text-[15px]',
  acceso: 'h-[52px] w-full rounded-[8px] text-[16px]',
}

/**
 * EL PADDING HORIZONTAL LO DECIDE EL TAMAÑO **Y** EL BORDE, y por eso no vive en `TAMANO`.
 *
 * El especimen §05 escribe la primaria en `padding:7px 14px` sin borde y la secundaria en
 * `padding:7px 13px` **con** borde de 1px. No es un descuido de un píxel: con `border-box`, el
 * borde se come el ancho, así que 13+1 y 14+0 dejan el texto a los mismos 14px del filo exterior.
 * Un botón primario y uno secundario que conviven en la misma barra tienen que medir igual; si la
 * secundaria se queda con `px-3.5`, mide 1px más de cada lado y la fila deja de estar peinada.
 *
 * Va en su propia tabla y no concatenado al de `TAMANO` porque dos `px-*` en la misma cadena de
 * clases los resuelve el orden del CSS generado, no el del código — el mismo motivo por el que el
 * tamaño ya se había separado de la variante en 08/2026.
 */
const PX: Record<TamanoBoton, { conBorde: string; sinBorde: string }> = {
  normal: { conBorde: 'px-[13px]', sinBorde: 'px-[14px]' },
  bloque: { conBorde: 'px-[15px]', sinBorde: 'px-4' },
  acceso: { conBorde: 'px-[15px]', sinBorde: 'px-4' },
}

/** Las clases completas de un botón. Una sola regla por propiedad: nada compite con nada. */
function clases(variante: Variante, tamano: TamanoBoton, extra: string) {
  const px = CON_BORDE[variante] ? PX[tamano].conBorde : PX[tamano].sinBorde
  return `${BASE} ${TAMANO[tamano]} ${px} ${VARIANTE[variante]} ${extra}`
}

export function Boton({
  variante = 'secundaria',
  tamano = 'normal',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; tamano?: TamanoBoton }) {
  return <button {...props} className={`${clases(variante, tamano, className)}`} />
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
    <Link href={href} {...props} className={`${clases(variante, tamano, className)}`}>
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
