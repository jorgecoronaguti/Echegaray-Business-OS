'use client'

// UNA CELDA DE COSTO QUE SE PUEDE ABRIR, Y LO POR VENCER DEBAJO.
//
// «A la derecha, cada vez que haga click en Materiales, HH, Mano de obra o Subcontratos, que me salga
// en ese menú discriminado lo que está considerando» (dueño, 15/09/2026). El número es la puerta al
// panel de detalle; el texto lo sigue decidiendo `costosDeObra.ts`, acá sólo se hace clickeable.
//
// ES UN `<button>` Y NO UN `<a>`, POR LA MISMA RAZÓN QUE `CeldaHH` y `AbrirOrdenes`: la celda vive
// DENTRO del `<Link>` de la fila, y un `<a>` adentro de otro `<a>` es HTML inválido. `preventDefault`
// y `stopPropagation` son obligatorios: sin cortar el evento, tocar el número navegaría TAMBIÉN al
// detalle del trabajo. Sin `href` se dibuja el mismo texto, quieto: un «—» que se aprieta y abre un
// panel vacío es peor que un «—» quieto.
//
// EL BOTÓN HEREDA COLOR Y TIPOGRAFÍA de la celda que lo envuelve: es la celda la que sabe si va en
// ámbar (parcial) o en mono (cifra), y un botón con color propio rompería esa regla.

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { V } from '@/shared/components/v2/patron'

export function AbrirDetalle({ href, etiqueta, children }: {
  /** `null` = no hay nada que abrir: se dibuja el texto y nada más. */
  href: string | null
  /** Qué hace el botón, para quien no ve la pantalla. */
  etiqueta: string
  children: ReactNode
}) {
  const router = useRouter()
  if (!href) return <>{children}</>
  return (
    <button
      type="button"
      data-testid="abrir-detalle-costo"
      data-href={href}
      aria-label={etiqueta}
      className="hover:underline"
      style={{ color: 'inherit', font: 'inherit', textAlign: 'right', maxWidth: '100%' }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(href) }}
    >
      {children}
    </button>
  )
}

/** «+ $12.864.000 por vencer», en texto secundario debajo del importe. Sin texto no ocupa lugar. */
export function PorVencer({ texto }: { texto: string | null }) {
  if (!texto) return null
  return (
    <span
      data-testid="por-vencer"
      className="font-mono tabular-nums"
      title={texto}
      // BLOQUE CON ELIPSIS: a 1.440 px el «+ $12.666.727 por vencer» se montaba 16 px sobre la celda de al lado
      // (QA 15/09). Un `nowrap` en línea desborda; un bloque que recorta no.
      style={{ display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '10.5px', lineHeight: '12px', color: V.tenue, whiteSpace: 'nowrap', textAlign: 'right' }}
    >
      {texto}
    </span>
  )
}
