'use client'

import { useRouter } from 'next/navigation'
import type { CSSProperties, ReactNode } from 'react'
import type { ObraDelSelector } from '../types'
import { rutaObraPortal } from '../rutas'

// EL SELECTOR DE OBRA DEL HEADER (`29:31`) Y DEL TELÉFONO (`30:72`).
//
// ═══ UN `<select>` TRANSPARENTE ENCIMA, NO UN MENÚ PROPIO ═══
//
// El mockup dibuja texto + chevron. Un menú desplegable escrito a mano necesita foco, teclado,
// cierre al hacer clic afuera y su propia capa — y en el teléfono no le gana al selector nativo, que
// abre la rueda del sistema. Va un `<select>` con opacidad 0 estirado sobre el bloque: el aspecto es
// exactamente el del mockup y el comportamiento es el nativo, incluido el teclado.
//
// ═══ CON UNA SOLA OBRA NO HAY CHEVRON ═══
//
// Un chevron que no despliega nada es un botón falso, y esta pantalla ya tiene el antecedente
// escrito («la pantalla más ancha que la base»). Con una obra se dibuja el nombre y nada más.

export function SelectorObra({ obras, actual, children, estilo }: {
  obras: ObraDelSelector[]
  /** El id de la obra que se está mirando. */
  actual: string | null
  /** Lo que se ve: el nombre, el icono y el chevron, tal como los dibuja cada mockup. */
  children: ReactNode
  estilo?: CSSProperties
}) {
  const router = useRouter()
  const varias = obras.length > 1

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', ...estilo }}>
      {children}
      {varias && (
        <select
          aria-label="Elegir obra"
          value={actual ?? ''}
          onChange={(e) => router.push(rutaObraPortal(e.target.value))}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            opacity: 0, cursor: 'pointer', appearance: 'none', border: 'none',
          }}
        >
          {obras.map((o) => (
            <option key={o.obra_id} value={o.obra_id}>{o.nombre}</option>
          ))}
        </select>
      )}
    </div>
  )
}
