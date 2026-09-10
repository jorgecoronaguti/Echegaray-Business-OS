'use client'

// LOS NÚMEROS DE LAS ÓRDENES DE UNA FILA: «OC 2162 · 05/08  OC 2097 · 15/07  +2».
//
// Pedido del dueño (10/09/2026) mirando los chips «OC ·4 · OP ·5»: «así no me sirve: me tiene que
// demostrar claramente la OC/OP que corresponde a cada obra desde esa pantalla». Un conteo obliga a
// abrir el panel para saber cuál es. El número y la fecha se leen sin abrir nada.
//
// `preventDefault` + `stopPropagation` son obligatorios y no una precaución: el botón está adentro
// del `<Link>` de la obra, y sin cortar el evento un clic navegaría a la obra —el número parecería
// roto— además de abrir el panel.

import { useRouter } from 'next/navigation'
import type { CSSProperties } from 'react'
import type { GrupoOrden } from '../services/ordenesCliente'

/** Versalita apagada, mono y tabular: son NÚMEROS puestos uno al lado del otro, y con tipografía
 *  proporcional «2162» y «2097» no se comparan de un vistazo. Sin fondo de color, como el resto de
 *  los adornos de la fila: el único que tiene derecho a gritar es el filo ámbar de «esto bloquea». */
const ESTILO: CSSProperties = {
  fontSize: '10.5px', letterSpacing: '0.04em', flexShrink: 0, whiteSpace: 'nowrap',
  textDecoration: 'underline', textUnderlineOffset: 3,
}

export function BotonOrdenes({
  grupos, resto, href, className, color, titulo,
}: {
  grupos: GrupoOrden[]
  /** Cuántas quedaron afuera. Se dice «+2» y no se esconden en silencio. */
  resto: number
  href: string
  className?: string
  color: string
  /** Qué son estos números, para el que pasa el mouse. */
  titulo?: string
}) {
  const router = useRouter()
  if (!grupos.length) return null
  const abrir = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault(); e.stopPropagation(); router.push(href)
  }
  return (
    <span className={className} style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
      {grupos.map((g) => (
        <button
          key={g.clave}
          type="button"
          data-testid="chip-orden"
          data-orden={g.clave}
          title={titulo}
          aria-label={`Ver ${g.rotulo}`}
          className="font-mono tabular-nums"
          style={{ ...ESTILO, color }}
          onClick={abrir}
        >
          {g.rotulo}
        </button>
      ))}
      {resto > 0 && (
        <button
          type="button"
          data-testid="chip-orden-resto"
          aria-label={`Ver las otras ${resto} órdenes`}
          className="font-mono tabular-nums"
          style={{ ...ESTILO, color, textDecoration: 'underline' }}
          onClick={abrir}
        >
          +{resto}
        </button>
      )}
    </span>
  )
}
