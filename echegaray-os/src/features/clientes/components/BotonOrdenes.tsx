'use client'

// LOS NÚMEROS DE LAS ÓRDENES DE UNA FILA: «OC 2256 · 02/09 · $12.100.000».
//
// Pedido del dueño (10/09/2026): «quiero que se vean las OC». La versión anterior los dibujaba en
// mono de 10,5px con subrayado permanente y mezclaba OC y OP en la misma línea. Acá cada rótulo es
// de UNA clase de papel —quien decide qué es una OC y qué una OP es `papelesCliente`— y el cuerpo
// es legible: 12px, tabular para que «2162» y «2097» se comparen de un vistazo, y el subrayado
// aparece al pasar el mouse, no antes: tres subrayados fijos bajo cada obra son tres rayas.
//
// `preventDefault` + `stopPropagation` son obligatorios y no una precaución: el botón está adentro
// del `<Link>` de la obra, y sin cortar el evento un clic navegaría a la obra —el número parecería
// roto— además de abrir el panel.

import { useRouter } from 'next/navigation'
import type { CSSProperties } from 'react'

/** Un rótulo ya escrito. Este componente no formatea nada: dibuja. */
export interface RotuloDeOrden { clave: string; texto: string }

const ESTILO: CSSProperties = { flexShrink: 0, textAlign: 'left' }

/**
 * El `nowrap` VA EN LA CLASE Y NUNCA INLINE: un `style` inline le gana a la media query y a 390px
 * el rótulo seguiría siendo una línea inelástica dentro de una celda más angosta. En el teléfono
 * los rótulos se apilan y el que no entra parte por sus separadores.
 */
const CLASE_CHIP
  = 'tabular-nums whitespace-nowrap text-left hover:underline max-[767px]:whitespace-normal'

/** Uno al lado del otro en escritorio; APILADOS a 390px, donde no hay ancho para dos rótulos. */
const CLASE_FILA = 'flex items-baseline gap-x-3 gap-y-[2px] flex-wrap max-[767px]:flex-col max-[767px]:items-start'

export function BotonOrdenes({
  rotulos, resto, href, className, color, titulo, tam = '12px',
}: {
  rotulos: RotuloDeOrden[]
  /** Cuántas quedaron afuera. Se dice «+2» y no se esconden en silencio. */
  resto: number
  href: string
  className?: string
  color: string
  /** Qué son estos números, para el que pasa el mouse. */
  titulo?: string
  tam?: string
}) {
  const router = useRouter()
  if (!rotulos.length) return null
  const abrir = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault(); e.stopPropagation(); router.push(href)
  }
  return (
    <span className={`${CLASE_FILA} ${className ?? ''}`} style={{ minWidth: 0 }}>
      {rotulos.map((r) => (
        <button
          key={r.clave}
          type="button"
          data-testid="chip-orden"
          data-orden={r.clave}
          title={titulo}
          aria-label={`Ver ${r.texto}`}
          className={CLASE_CHIP}
          style={{ ...ESTILO, color, fontSize: tam }}
          onClick={abrir}
        >
          {r.texto}
        </button>
      ))}
      {resto > 0 && (
        <button
          type="button"
          data-testid="chip-orden-resto"
          aria-label={`Ver las otras ${resto} órdenes`}
          className={CLASE_CHIP}
          style={{ ...ESTILO, color, fontSize: tam, textDecoration: 'underline', textUnderlineOffset: 3 }}
          onClick={abrir}
        >
          +{resto}
        </button>
      )}
    </span>
  )
}
