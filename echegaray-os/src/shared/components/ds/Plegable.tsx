'use client'

import { useId, useState, type ReactNode } from 'react'

// PROGRESSIVE DISCLOSURE — `design/system/COMPONENTS.md` §Accordion.
//
// Fila de 44px: nombre + contador a la izquierda, chevron que rota 90° al abrir. CERRADO por
// defecto. La regla completa de `UX_PRINCIPLES.md` §4 tiene una excepción que es la parte que
// importa: **un problema crítico se muestra aunque su sección esté plegada**. Una sección
// «Impedimentos (2)» cerrada esconde que uno vence mañana, y esconder eso es peor que no tenerlo.
// Por eso existe `alerta`: se dibuja en la fila CERRADA, en `neg`, sin abrir nada.

export function Plegable({
  titulo,
  cuenta,
  alerta,
  abiertoPorDefecto = false,
  children,
  testid,
}: {
  titulo: ReactNode
  cuenta?: number | null
  /** Lo que no puede esperar a que alguien abra la sección. Se dibuja cerrada, en `neg`. */
  alerta?: ReactNode
  abiertoPorDefecto?: boolean
  children: ReactNode
  testid?: string
}) {
  const [abierto, setAbierto] = useState(abiertoPorDefecto)
  const id = useId()
  return (
    <section data-testid={testid} data-abierto={abierto ? '' : undefined} className="border-b border-[#EFEEEA]">
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => setAbierto((v) => !v)}
        className="flex h-disclosure w-full items-center gap-2 text-left"
      >
        <span
          aria-hidden
          className={`inline-block w-2 shrink-0 text-[13px] leading-none text-[#C9C4C2] transition-transform ${abierto ? 'rotate-90' : ''}`}
        >
          ›
        </span>
        <span className={`text-[12.5px] ${abierto ? 'font-semibold text-ink' : 'text-ink-soft'}`}>{titulo}</span>
        {cuenta !== null && cuenta !== undefined && (
          <span className="font-mono text-[11.5px] tabular-nums text-faint">{cuenta}</span>
        )}
        <span className="ml-auto pr-1 text-[11.5px] text-neg">{!abierto && alerta}</span>
      </button>
      {abierto && (
        <div id={id} className="pb-4">
          {children}
        </div>
      )}
    </section>
  )
}

/**
 * Grupo de una tabla (un rubro). Fila de 38px, 11,5/600, versalitas suaves, contador mono y caret.
 * Separación de 8px ANTES del grupo — y esos 8px se acumulan en el cálculo de posición del Gantt,
 * que es lo que hace que sus filas caigan 1:1 sobre las de la tabla.
 */
export function FilaGrupo({
  titulo,
  cuenta,
  abierto,
  onToggle,
  derecha,
  colSpan,
  testid,
}: {
  titulo: ReactNode
  cuenta?: number | null
  abierto: boolean
  onToggle: () => void
  derecha?: ReactNode
  colSpan: number
  testid?: string
}) {
  return (
    <tr data-testid={testid} data-abierto={abierto ? '' : undefined}>
      <td colSpan={colSpan} className="p-0">
        <div className="pt-2">
          <div className="flex h-fila-compacta items-center gap-2 border-b border-[#EFEEEA]">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={abierto}
              className="flex min-w-0 items-center gap-2 text-left"
            >
              <span
                aria-hidden
                className={`inline-block w-2 shrink-0 text-[12px] leading-none text-[#C9C4C2] transition-transform ${abierto ? 'rotate-90' : ''}`}
              >
                ›
              </span>
              <span className="truncate text-[11.5px] font-semibold tracking-[0.04em] text-ink">{titulo}</span>
              {cuenta !== null && cuenta !== undefined && (
                <span className="font-mono text-[11px] tabular-nums text-faint">{cuenta}</span>
              )}
            </button>
            <span className="ml-auto">{derecha}</span>
          </div>
        </div>
      </td>
    </tr>
  )
}
