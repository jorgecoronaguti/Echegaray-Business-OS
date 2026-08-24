'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

// EL MENÚ CONTEXTUAL DE FILA — `design/system/COMPONENTS.md` §Contextual action menu.
//
// «Acciones de fila: sólo en hover o menú contextual. NUNCA una fila llena de botones». Una tabla
// con tres botones por fila tiene, a treinta filas, noventa objetivos de clic compitiendo con el
// dato — y la persona vino a leer el dato. El `···` al final de la fila guarda las acciones donde
// se necesitan (junto al objeto sobre el que actúan) sin cobrarle ruido a las otras 29 filas.
//
// Es el ÚNICO lugar del sistema donde se permite una sombra, y por eso está acotada a un token:
// un menú flotante necesita despegarse de la tabla o parece parte de ella.

export function MenuContextual({
  items,
  etiqueta = 'Acciones',
  testid = 'menu-fila',
  disparador,
}: {
  items: { label: ReactNode; onClick?: () => void; href?: string; destructiva?: boolean; testid?: string }[]
  etiqueta?: string
  testid?: string
  /**
   * El botón que abre el menú, cuando la pantalla necesita OTRO dibujo. Las carteras del zip
   * (`22:143`, `24:146`, `25:117`) dibujan tres círculos RELLENOS de 1,6px de radio en un SVG de
   * 15px; acá el disparador es el carácter `···` en 15px, que no es lo mismo ni mide lo mismo.
   *
   * Es un hueco y no un reemplazo: sin `disparador` sigue saliendo el de siempre, así que las
   * pantallas que ya lo usan no cambian. Lo que NO se delega es el comportamiento —abrir, cerrar
   * al hacer clic afuera, cerrar con Escape, `aria-expanded`—: eso vive acá una sola vez.
   */
  disparador?: ReactNode
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
    <div ref={caja} className="relative inline-block text-right">
      <button
        type="button"
        aria-label={etiqueta}
        aria-expanded={abierto}
        data-testid={testid}
        onClick={(e) => {
          e.stopPropagation()
          setAbierto((v) => !v)
        }}
        className={
          disparador
            ? 'flex items-center justify-center text-[#C9C4C2] transition-colors hover:text-[#1F1F1E]'
            : 'rounded-control px-2 py-1 text-[15px] leading-none text-faint transition-colors hover:bg-surface-quiet hover:text-ink'
        }
      >
        {disparador ?? '···'}
      </button>
      {abierto && (
        <div
          role="menu"
          data-testid={`${testid}-abierto`}
          className="absolute right-0 top-full z-40 mt-1 min-w-[180px] rounded-card border border-line bg-surface py-1 shadow-pop"
        >
          {items.map((i, k) =>
            i.href ? (
              <a
                key={k}
                href={i.href}
                role="menuitem"
                data-testid={i.testid}
                className={`block px-3 py-1.5 text-left text-[13px] hover:bg-surface-quiet ${i.destructiva ? 'text-neg' : 'text-ink-soft'}`}
              >
                {i.label}
              </a>
            ) : (
              <button
                key={k}
                type="button"
                role="menuitem"
                data-testid={i.testid}
                onClick={(e) => {
                  e.stopPropagation()
                  setAbierto(false)
                  i.onClick?.()
                }}
                className={`block w-full px-3 py-1.5 text-left text-[13px] hover:bg-surface-quiet ${i.destructiva ? 'text-neg' : 'text-ink-soft'}`}
              >
                {i.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
