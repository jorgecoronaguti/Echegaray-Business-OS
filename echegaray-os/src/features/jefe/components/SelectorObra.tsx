'use client'

import { usePathname, useRouter } from 'next/navigation'
import { conObra } from '../services/navegacion'
import type { ObraDelJefe } from '../services/jefeService'
import { C } from '@/shared/components/movil/tokens'

// CAMBIAR DE OBRA — el renglón con `▾` que J01 dibuja bajo el nombre de la empresa.
//
// ═══ POR QUÉ NO UN MENÚ PROPIO ═══
//
// Un desplegable dibujado a mano en 390px es una lista que hay que hacer scrollear con el pulgar,
// que no se cierra al tocar afuera si alguien olvidó el manejador, y que no respeta el tamaño de
// letra del sistema. El `<select>` nativo abre la rueda de iOS y la hoja de Android, funciona con
// lector de pantalla sin una línea de ARIA, y con guante se falla mucho menos.
//
// El renglón queda como TEXTO —11,5px `muted` con el chevron de 12px al lado, como lo mide J01— y
// el `<select>` va encima, transparente y del tamaño del bloque.
//
// LA OBRA VIVE EN LA URL. Al cambiarla se navega a la MISMA pantalla con otra obra: no se pierde
// dónde estaba el jefe, que es lo que pasa cuando cambiar de obra te devuelve al inicio.

export function SelectorObra({ obras, actual }: { obras: ObraDelJefe[]; actual: ObraDelJefe }) {
  const router = useRouter()
  const pathname = usePathname() ?? '/obra/hoy'

  if (obras.length <= 1) {
    return (
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {actual.nombre}
      </span>
    )
  }

  return (
    <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {actual.nombre}
      </span>
      <span style={{ display: 'flex', color: C.muted, flexShrink: 0 }}>
        {/* El chevron de J01 apunta ABAJO: es «desplegar», no «entrar». */}
        <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
      <select
        aria-label="Cambiar de obra"
        data-testid="selector-obra"
        value={actual.id}
        onChange={(e) => router.push(conObra(pathname, e.target.value))}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
      >
        {obras.map((o) => (
          <option key={o.id} value={o.id}>{o.nombre}</option>
        ))}
      </select>
    </span>
  )
}
