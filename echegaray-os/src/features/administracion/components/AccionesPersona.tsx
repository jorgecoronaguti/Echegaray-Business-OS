'use client'

// EL `···` DE LA FILA DE PERSONAL — canónico 19, última columna (26px).
//
// El mockup lo dibuja como tres puntos rellenos de 15×15 en `#C9C4C2`, que pasan a `#1F1F1E` al
// pasar por encima. No se usa `ds/MenuContextual` porque ese dibuja el glifo tipográfico «···» y el
// canónico dibuja un SVG: son dos formas distintas del mismo control, y acá manda el mockup.
//
// ═══ Y LAS ACCIONES PASAN EN EL LUGAR ═══
//
// El dueño, textual: *"necesito que la pantalla permita que si quiero editar edite ahí mismo, no me
// sirve que me cargue y me lleve a otro lado"*. Dar de baja y reincorporar son las dos acciones que
// el listado puede resolver sin abrir la ficha, y las dos ya existen como server actions
// (`personasActions`) con su `revalidatePath`: la fila se redibuja sola. Lo que NO se hace acá es
// editar identidad —eso son ocho campos y tiene su panel en la ficha—.
//
// El fallo de la acción se muestra ADENTRO del menú. Un `revalidatePath` que no ocurre porque la
// base rechazó el cambio, sin mensaje, se ve exactamente igual que un clic que no se registró.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { BotonAccion } from '@/shared/components/ui'
import { darDeBaja, reincorporar } from '../services/personasActions'

export function AccionesPersona({
  personaId, nombre, enLaEmpresa,
}: {
  personaId: string
  nombre: string
  enLaEmpresa: boolean
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
        data-testid="acciones-persona"
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
          data-testid="acciones-persona-abierto"
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full z-40 mt-1 min-w-[200px] rounded-card border border-line bg-surface py-1 text-left shadow-pop"
        >
          <Link
            href={`/administracion/personas/${personaId}`}
            prefetch={false}
            role="menuitem"
            data-testid="accion-abrir-ficha"
            className="block px-3 py-1.5 text-[13px] text-ink-soft hover:bg-surface-quiet"
          >
            Abrir la ficha
          </Link>
          <div className="px-3 py-1.5">
            {enLaEmpresa ? (
              <BotonAccion accion={darDeBaja} args={[personaId]} tono="peligro" testid="accion-dar-de-baja">
                Dar de baja
              </BotonAccion>
            ) : (
              <BotonAccion accion={reincorporar} args={[personaId]} testid="accion-reincorporar">
                Reincorporar
              </BotonAccion>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
