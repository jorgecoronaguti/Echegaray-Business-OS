'use client'

// LA CELDA DE PAPELES ABRE EL PANEL DE ÓRDENES, Y NO PASA NADA MÁS.
//
// ═══ QUÉ REEMPLAZA (10/09/2026) ═══
//
// A `BotonOrdenes`, que dibujaba «OC 1984 · 18/06 · $4.336.587   OC 1985 · …   +2» DEBAJO del
// nombre de cada obra. El dueño lo vio y lo llamó ruido: tres rótulos monoespaciados de 12px
// compitiendo con las siete columnas de la derecha, en una fila que ya tenía nombre, avance,
// contratado, dos costos, margen y cobro. La lista tiene que contestar «cuánto» de un vistazo; el
// detalle de qué OC es cada una es otra pregunta y ya tenía su lugar —el panel lateral—.
//
// Ahora el TOTAL que la columna ya dibujaba («$ 49.886.583 · 5 OC») es el que se toca. Una sola
// afirmación por celda, y el detalle a un clic sin salir de la lista (Figma: acciones cerca del
// objeto, edición sin abandonar el contexto).
//
// `preventDefault` + `stopPropagation` son obligatorios y no una precaución: esto vive adentro del
// `<Link>` de la fila, y sin cortar el evento un clic navegaría a la obra además de abrir el panel.
// Un `<a>` adentro de otro `<a>` es HTML inválido y por eso es un `<button>`.

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

export function AbrirOrdenes({ href, titulo, etiqueta, children, className, testid }: {
  href: string
  /** Qué son estos números, para el que pasa el mouse. */
  titulo: string
  /** Qué hace el botón, para quien no ve la pantalla. */
  etiqueta: string
  children: ReactNode
  className?: string
  testid?: string
}) {
  const router = useRouter()
  const abrir = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault(); e.stopPropagation(); router.push(href)
  }
  return (
    <button
      type="button"
      data-testid={testid}
      title={titulo}
      aria-label={etiqueta}
      className={`text-right hover:underline ${className ?? ''}`}
      onClick={abrir}
    >
      {children}
    </button>
  )
}
