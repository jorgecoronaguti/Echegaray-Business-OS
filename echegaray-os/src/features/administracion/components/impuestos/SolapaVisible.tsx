'use client'

// LA SOLAPA ABIERTA SIEMPRE A LA VISTA. En el teléfono la fila de solapas se desliza de costado y
// «Todo el historial» queda fuera de pantalla: quien entró por un enlace no veía cuál estaba abierta.
// Al montar, se trae la activa al borde visible de SU fila (`inline: 'nearest'`, sin mover la página).
import { useEffect, useRef } from 'react'

export function SolapaVisible({ activa }: { activa: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const nav = ref.current?.parentElement
    const link = nav?.querySelector<HTMLElement>(`[data-testid="solapa-${activa}"]`)
    if (!nav || !link) return
    // El `nav` es `relative`: `offsetLeft` del enlace ya se mide desde el borde de la fila.
    const izq = link.offsetLeft
    if (izq + link.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = izq + link.offsetWidth - nav.clientWidth + 20
  }, [activa])
  return <span ref={ref} hidden />
}
