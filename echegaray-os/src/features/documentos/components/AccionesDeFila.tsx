'use client'

import type { ReactNode } from 'react'

// LA CELDA DE ACCIONES DE LA 27 ES UN COMPONENTE DE CLIENTE por una sola razón: frena la
// propagación del clic para que abrir o descargar en Drive no seleccione la fila. Un `onClick` no
// puede vivir en un componente de servidor —`TablaDocumentos` lo es— y ponerlo ahí tumbaba el render
// de /documentos entero (React #419 en producción, 24/08).
export function AccionesDeFila({ children }: { children: ReactNode }) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}
