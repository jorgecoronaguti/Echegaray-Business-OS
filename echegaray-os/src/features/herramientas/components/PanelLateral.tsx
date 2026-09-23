'use client'

// EL PANEL AL COSTADO — `D05:14-20`: 520px, filo izquierdo fuerte, `padding:24px 26px 26px`, gap 22.
// Escape lo cierra. En un teléfono ocupa el ancho entero.

import { useEffect, type ReactNode } from 'react'
import { V } from './estilo'

export function PanelLateral({ titulo, subtitulo, onCerrar, pie, children, testid }: {
  titulo: string
  subtitulo?: ReactNode
  onCerrar: () => void
  pie?: ReactNode
  children: ReactNode
  testid: string
}) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onCerrar])
  return (
    <aside
      data-testid={testid} aria-label={titulo}
      className="max-md:fixed max-md:inset-0 max-md:z-40 max-md:w-full"
      style={{
        // `maxWidth`: el estilo en línea le gana a `max-md:w-full`, y 520 fijos en un teléfono con
        // `?pc=1` corrían la página de costado (dueño, 23/09/2026).
        width: 520, maxWidth: '100%', flexShrink: 0, background: '#FFFFFF', borderLeft: `1px solid ${V.lineaFuerte}`,
        padding: '24px 26px 26px', display: 'flex', flexDirection: 'column', gap: 22,
        // Fijo como la cabecera (dueño, 22/09): debajo del header de la app (44) y de las solapas (39).
        position: 'sticky', top: 83, zIndex: 15, alignSelf: 'flex-start', height: 'calc(100vh - 83px)', overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-.01em' }}>{titulo}</div>
          {subtitulo && <div style={{ fontSize: '12.5px', color: V.apagado }}>{subtitulo}</div>}
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" data-testid="cerrar-panel" style={{ fontSize: '18px', color: V.tenue, lineHeight: 1, padding: 4 }}>
          ×
        </button>
      </div>
      {children}
      {pie && <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, paddingTop: 18, flexWrap: 'wrap' }}>{pie}</div>}
    </aside>
  )
}

/** Un bloque del panel con su rótulo mono arriba y el filo que lo separa del anterior. `D05:28`. */
export function Bloque({ rotulo, derecha, primero, children }: { rotulo: ReactNode; derecha?: ReactNode; primero?: boolean; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, ...(primero ? {} : { paddingTop: 16, borderTop: `1px solid ${V.linea}` }) }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: '10.5px', letterSpacing: '.06em', color: V.tenue, textTransform: 'uppercase' }}>{rotulo}</div>
        {derecha}
      </div>
      {children}
    </div>
  )
}

export function ErrorPanel({ texto }: { texto: string | null }) {
  if (!texto) return null
  return <div role="alert" data-testid="error-panel" style={{ fontSize: '12.5px', color: V.neg, lineHeight: 1.5 }}>{texto}</div>
}
