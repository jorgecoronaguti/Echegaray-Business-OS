'use client'

import { usePathname, useRouter } from 'next/navigation'
import { conObra } from '../services/navegacion'
import type { ObraDelJefe } from '../services/jefeService'

// CAMBIAR DE OBRA — el `▾` del contrato, resuelto con el selector NATIVO del teléfono.
//
// ═══ POR QUÉ NO UN MENÚ PROPIO ═══
//
// Un desplegable dibujado a mano en 390px es una lista que hay que hacer scrollear con el pulgar,
// que no se cierra al tocar afuera si alguien olvidó el manejador, y que no respeta el tamaño de
// letra del sistema. El `<select>` nativo abre la rueda de iOS y la hoja de Android, funciona con
// lector de pantalla sin una línea de ARIA, y con guante se falla mucho menos.
//
// El título grande queda como TEXTO y el `<select>` va encima, transparente y del tamaño del bloque:
// se ve el diseño del contrato y se toca un control nativo de 48px.
//
// LA OBRA VIVE EN LA URL. Al cambiarla se navega a la MISMA pantalla con otra obra — no se pierde
// dónde estaba el jefe, que es lo que pasa cuando cambiar de obra te devuelve al inicio.

export function SelectorObra({ obras, actual, compacto = false }: {
  obras: ObraDelJefe[]
  actual: ObraDelJefe
  /**
   * El renglón chico de arriba del título, como lo dibuja el encabezado de J01: la obra no es el
   * título de la pantalla —el título es «Hoy»— sino el contexto en el que se lee todo lo demás.
   */
  compacto?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname() ?? '/obra/hoy'
  const letra = compacto
    ? 'text-[13px] font-medium leading-tight text-muted'
    : 'text-[20px] font-semibold leading-tight text-ink'

  if (obras.length <= 1) {
    return <span className={`block truncate ${letra}`}>{actual.nombre}</span>
  }

  return (
    <span className={`relative flex items-center gap-2 ${compacto ? 'min-h-[28px]' : 'min-h-[44px] gap-2.5'}`}>
      <span className={`min-w-0 truncate ${letra}`}>{actual.nombre}</span>
      <span aria-hidden className="shrink-0 text-[11px] text-faint">▾</span>
      <select
        aria-label="Cambiar de obra"
        data-testid="selector-obra"
        value={actual.id}
        onChange={(e) => router.push(conObra(pathname, e.target.value))}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {obras.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
      </select>
    </span>
  )
}
