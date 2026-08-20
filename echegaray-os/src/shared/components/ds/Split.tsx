'use client'

import { useCallback, useRef, useState, type ReactNode } from 'react'

// EL SPLIT ARRASTRABLE — `design/system/LAYOUT_RESPONSIVE.md` §Split workspace.
//
// El patrón de Figma: dos zonas y un divisor que el usuario mueve. No es un lujo de interacción —
// es lo que permite que la MISMA pantalla sirva para dos trabajos distintos. Quien está armando el
// plan quiere la tabla ancha; quien está mirando cómo viene la obra quiere el Gantt ancho. Un
// reparto fijo obliga a elegir por los dos y siempre elige mal para uno.
//
// EL HANDLE ES INVISIBLE EN REPOSO. Nueve píxeles de zona de agarre —que es lo que hace falta para
// no tener que apuntar— con un hairline de 1px dibujado en el medio. En hover y durante el arrastre
// se vuelve amarillo de 2px: la marca aparece exactamente donde el usuario está actuando.
//
// ═══ LA PREFERENCIA VIAJA EN COOKIE, Y ESO NO ES UN DETALLE ═══
//
// Guardarla en `localStorage` obliga a leerla DESPUÉS del primer render: el servidor no la tiene,
// así que la pantalla sale con el ancho por defecto y se corrige sola cien milisegundos más tarde.
// Ese salto es visible y molesto justo en la pantalla más pesada del sistema.
//
// En cookie la lee el SERVIDOR (`anchoSplit()`) y la manda como `inicial`: la primera pintura ya
// sale con el ancho que la persona eligió. Es la misma división que el OS ya usa para la vista
// recordada de `/obras` — guarda el navegador, restaura el servidor.

const MAX = 760

/**
 * Ancho vivo del split. `inicial` viene del servidor (cookie), así que no hay efecto de
 * hidratación ni salto: el primer render ya es el correcto.
 */
export function useSplit({
  clave,
  inicial,
  min = 340,
  max = MAX,
}: {
  clave: string
  inicial: number
  min?: number
  max?: number
}) {
  const [ancho, setAncho] = useState(() => Math.min(max, Math.max(min, inicial)))
  const [arrastrando, setArrastrando] = useState(false)

  const guardar = useCallback(
    (n: number) => {
      const acotado = Math.min(max, Math.max(min, n))
      setAncho(acotado)
      document.cookie = `split-${clave}=${acotado}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    },
    [clave, min, max],
  )

  const acotar = useCallback((n: number) => Math.min(max, Math.max(min, n)), [min, max])

  return { ancho, setAncho, guardar, acotar, arrastrando, setArrastrando, min, max }
}

export function Divisor({
  onArrastre,
  arrastrando,
  setArrastrando,
  testid = 'divisor',
  titulo = 'Arrastrar para cambiar el ancho',
}: {
  /** Recibe el delta en píxeles desde donde arrancó el arrastre, y si el arrastre terminó. */
  onArrastre: (deltaX: number, fin: boolean) => void
  arrastrando: boolean
  setArrastrando: (v: boolean) => void
  testid?: string
  titulo?: string
}) {
  // Los dos escuchadores se referencian entre sí (soltar quita a mover y a sí mismo). Con
  // `useCallback` eso es una referencia circular que el linter marca con razón; con un ref que
  // guarda la limpieza, cada arrastre instala y desinstala su propio par sin ciclo.
  const limpiar = useRef<(() => void) | null>(null)

  const empezar = (e: React.PointerEvent) => {
    const origen = e.clientX
    const mover = (ev: PointerEvent) => onArrastre(ev.clientX - origen, false)
    const soltar = (ev: PointerEvent) => {
      onArrastre(ev.clientX - origen, true)
      limpiar.current?.()
    }
    limpiar.current = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      // El cursor y la selección se toman del DOCUMENTO durante el arrastre: sin esto, salirse del
      // handle con el botón apretado devuelve la flecha y empieza a seleccionar texto.
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setArrastrando(false)
      limpiar.current = null
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    setArrastrando(true)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      data-testid={testid}
      data-arrastrando={arrastrando ? '' : undefined}
      title={titulo}
      onPointerDown={empezar}
      className={`group relative hidden w-[9px] shrink-0 cursor-col-resize lg:block ${
        arrastrando ? 'bg-marca/10' : 'hover:bg-marca/10'
      }`}
    >
      <span
        className={`absolute inset-y-0 left-1/2 -translate-x-1/2 transition-all ${
          arrastrando ? 'w-[2px] bg-marca' : 'w-px bg-[#EFEEEA] group-hover:w-[2px] group-hover:bg-marca'
        }`}
      />
    </div>
  )
}

/** Envoltura de la zona elástica: `min-w-0` es lo que evita que su contenido empuje al vecino. */
export function ZonaSplit({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex min-w-0 flex-1 flex-col ${className}`}>{children}</div>
}
