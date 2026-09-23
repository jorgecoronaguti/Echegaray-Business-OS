'use client'

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { scrollParaMostrar } from '../desplazarSolapa'

// UNA BANDA DE SOLAPAS QUE SE CORRE POR DENTRO Y MUESTRA LA ACTIVA (dueño, 23/09/2026: vistas
// mobile por nivel). `SolapasDeFicha` envolvía en cascada: en la ficha del cliente, nueve solapas
// caían en tres renglones a 390 px. Acá la banda es de una sola línea, scrollea por dentro
// (`barra-corrible`, globals.css) y al montar se corre lo justo para que la solapa con
// `aria-current="page"` quede a la vista — la misma regla que `AppHeader`. En escritorio entra todo
// y no se corre nada.
export function BarraCorrible({ children, style, testid }: { children: ReactNode; style?: CSSProperties; testid?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const nav = ref.current
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !el) return
    const izquierda = el.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft
    const nuevo = scrollParaMostrar({ ancho: nav.clientWidth, scroll: nav.scrollLeft, izquierda, anchoSolapa: el.offsetWidth })
    if (nuevo != null) nav.scrollLeft = nuevo
  }, [])
  return (
    <div ref={ref} className="barra-corrible" style={{ display: 'flex', alignItems: 'stretch', minWidth: 0, ...style }} data-testid={testid}>
      {children}
    </div>
  )
}
