'use client'

// EL `···` DE LA FILA DE CUADRILLA — canónico 21, última columna (26px).
//
// Mismo control que el de Personal (`AccionesPersona`) y por el mismo motivo: el canónico dibuja un
// SVG de tres puntos rellenos en `#C9C4C2`, no el glifo tipográfico «···» de `ds/MenuContextual`.
//
// ARCHIVAR NO BORRA. `cuadrilla_integrante` guarda períodos con `desde`/`hasta` y las HH de la
// quincena cuelgan de esa gente: borrar la cuadrilla dejaría horas imputadas sin dueño. La acción
// es la MISMA `archivarCuadrilla` que el panel — se liga con `bind` del lado del servidor, así que
// la fila nunca manda por el formulario qué cuadrilla tocar.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { BotonAccion } from '@/shared/components/ui'

export function AccionesCuadrilla({
  cuadrillaId, nombre, abrirHref, archivar,
}: {
  cuadrillaId: string
  nombre: string
  abrirHref: string
  archivar: (cuadrillaId: string) => Promise<{ ok: true; mensaje?: string } | { ok: false; error: string }>
}) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', esc)
    }
  }, [abierto])

  return (
    <div ref={caja} className="relative flex justify-center">
      <button
        type="button"
        aria-label={`Acciones de ${nombre}`}
        aria-expanded={abierto}
        title="Más acciones"
        data-testid="acciones-cuadrilla"
        onClick={(e) => { e.stopPropagation(); setAbierto((v) => !v) }}
        className={`flex cursor-pointer items-center justify-center transition-colors ${
          abierto ? 'text-ink' : 'text-[#C9C4C2] hover:text-ink'
        }`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {abierto && (
        <div
          role="menu"
          data-testid="acciones-cuadrilla-abierto"
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full z-40 mt-1 min-w-[200px] rounded-card border border-line bg-surface py-1 text-left shadow-pop"
        >
          <Link
            href={abrirHref}
            prefetch={false}
            role="menuitem"
            data-testid="accion-abrir-cuadrilla"
            className="block px-3 py-1.5 text-[13px] text-ink-soft hover:bg-surface-quiet"
          >
            Abrir la cuadrilla
          </Link>
          <div className="px-3 py-1.5">
            <BotonAccion accion={archivar} args={[cuadrillaId]} tono="peligro" testid="accion-archivar-cuadrilla">
              Archivar
            </BotonAccion>
          </div>
        </div>
      )}
    </div>
  )
}
