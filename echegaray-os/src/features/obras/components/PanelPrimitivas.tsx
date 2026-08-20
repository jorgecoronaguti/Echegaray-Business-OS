'use client'

// LAS PRIMITIVAS DEL PANEL DE ACTIVIDAD — el formateador de números y un plegable interno.
//
// Eran cinco. `Rotulo` y `Dato` se fueron con el Design Handoff V2: los títulos de sección ahora los
// pone `Plegable` del DS y la comparación Plan|Real la dibuja `PlanVsReal`, así que repetirlos acá
// era mantener dos definiciones de lo mismo — que es exactamente lo que el design system existe
// para evitar.
//
// El `Plegable` de acá NO compite con el del DS: éste es un `<details>` de SEGUNDO nivel, para lo
// que se abre DENTRO de una sección ya abierta (el formulario de medición). El del DS es la sección.

import type { ReactNode } from 'react'

export const n2 = (v: number | null | undefined) =>
  (v == null ? null : Number(v).toLocaleString('es-AR', { maximumFractionDigits: 2 }))

/** El plegable de los bloques secundarios. Compacto y con el conteo a la vista: lo que hay adentro
 *  se sabe sin abrirlo, que es lo que hace que abrirlo valga la pena. */
export function Plegable({ titulo, cuenta, testid, abierto, children }: {
  titulo: string
  cuenta?: number | null
  testid?: string
  /** Abierto de entrada. Lo usa el panel cuando el bloque ES la pestaña: ahí no hay nada que
   *  desplegar, ya se eligió mirarlo. */
  abierto?: boolean
  children: ReactNode
}) {
  return (
    <details className="rounded-card border border-line bg-surface px-3 py-2" data-testid={testid} open={abierto}>
      <summary className="cursor-pointer text-[12.5px] text-muted">
        {titulo}
        {cuenta != null && cuenta > 0 && <span className="ml-2 tabular-nums text-ink">{cuenta}</span>}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  )
}
