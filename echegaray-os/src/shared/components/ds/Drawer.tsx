'use client'

import { useEffect, type ReactNode } from 'react'

// EL DRAWER — el panel que se abre AL COSTADO, ENCIMA de lo que hay debajo.
//
// ═══ POR QUÉ NO ES `PanelDetalle` ═══
//
// `PanelDetalle` es un panel PERMANENTE: en escritorio pasa a `lg:static` y ocupa una columna del
// layout, o sea que le saca ancho al contenido. Es lo correcto para una lista angosta al lado de un
// detalle. No lo es para una TABLA de hasta dieciséis columnas de días dentro de un `overflow-x`:
// quitarle 400px la manda a scroll horizontal justo cuando hay que ver la fila que se está
// corrigiendo. Este drawer flota encima y no mueve un píxel del contenido — «la interfaz no se
// mueve mientras se trabaja», que es la regla de interacción que el OS toma de Figma.
//
// ═══ EL FONDO ES TRANSPARENTE EN ESCRITORIO, Y ES A PROPÓSITO ═══
//
// El pedido fue ver la grilla DETRÁS mientras se corrige. Un velo oscuro la apagaría y el panel
// pasaría a ser un modal con otra forma. La contrapartida se declara: el primer clic sobre la
// grilla CIERRA el panel en vez de entrar a la celda. Es el precio de «se cierra clickeando
// fuera», que también se pidió; sin fondo que capture el clic no hay forma de saber que se clickeó
// afuera sin escuchar todo el documento.
//
// En teléfono el panel ocupa el ancho entero —abajo de 768px no hay lugar para dos zonas— y ahí el
// fondo sí se tiñe: no hay nada visible detrás que proteger.

export function Drawer({
  titulo, subtitulo, onCerrar, ancho = 400, pie, children, testid = 'drawer',
}: {
  titulo: ReactNode
  subtitulo?: ReactNode
  onCerrar: () => void
  /** Sólo desde 768px. Abajo de eso el ancho lo manda la pantalla. */
  ancho?: number
  /** La primaria del objeto, fija abajo: se llega sin scrollear el panel entero. */
  pie?: ReactNode
  children: ReactNode
  testid?: string
}) {
  // ESCAPE CIERRA. Se escucha en `keydown` del documento porque el foco puede estar en cualquier
  // campo del panel o incluso fuera de él, y un `onKeyDown` en el `aside` sólo lo vería si el foco
  // está adentro.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar el panel"
        onClick={onCerrar}
        data-testid={`${testid}-fondo`}
        className="fixed inset-0 z-30 bg-ink/25 md:bg-transparent"
      />
      <aside
        data-testid={testid}
        role="dialog"
        aria-modal="false"
        aria-label={typeof titulo === 'string' ? titulo : undefined}
        style={{ ['--ancho-drawer' as string]: `${ancho}px` }}
        className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-line bg-surface shadow-card md:[width:var(--ancho-drawer)]"
      >
        <header className="flex items-start gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16px] font-semibold leading-tight text-ink">{titulo}</h2>
            {subtitulo && <div className="mt-1 text-[12.5px] text-muted">{subtitulo}</div>}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar el panel"
            data-testid={`${testid}-cerrar`}
            className="-mr-1 -mt-1 shrink-0 rounded-control px-2 py-1 text-[15px] leading-none text-faint transition-colors hover:bg-surface-quiet hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {pie && (
          <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3" data-testid={`${testid}-pie`}>
            {pie}
          </footer>
        )}
      </aside>
    </>
  )
}
