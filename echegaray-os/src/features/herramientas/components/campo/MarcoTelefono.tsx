// EL MARCO DE LAS PANTALLAS DE TELÉFONO DE HERRAMIENTAS (M01–M14).
//
// Sigue a `src/app/campo/marco.tsx` —una columna, 16px de costado, objetivos de 44px o más— con la
// anatomía del diseño: barra de 46px arriba (volver + título), contenido con `padding:18px 16px`, y la
// acción primaria fija abajo, 52px, al alcance del pulgar (`M01:17`, `M03:22`).

import Link from 'next/link'
import type { ReactNode } from 'react'
import { V } from '../estilo'

export function MarcoTelefono({ titulo, volver, pie, oscuro, children, derecha }: {
  titulo: ReactNode
  /** `null` = pantalla de entrada: se dibuja el nombre del módulo en vez de la flecha. */
  volver: string | null
  pie?: ReactNode
  oscuro?: boolean
  derecha?: ReactNode
  children: ReactNode
}) {
  const fondo = oscuro ? '#1F1F1E' : '#FFFFFF'
  const tinta = oscuro ? '#FFFFFF' : V.tinta
  const filo = oscuro ? '#30302F' : V.linea
  return (
    <div style={{ minHeight: '100dvh', background: fondo, color: tinta, display: 'flex', flexDirection: 'column' }}>
      <div style={{ width: '100%', maxWidth: 560, margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header style={{ height: 46, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderBottom: `1px solid ${filo}`, flexShrink: 0, position: 'sticky', top: 0, background: fondo, zIndex: 5 }}>
          {volver != null ? (
            <Link href={volver} prefetch={false} data-testid="volver" aria-label="Volver" style={{ fontSize: '18px', color: oscuro ? '#FFFFFF' : V.apagado, minWidth: 28, minHeight: 44, display: 'flex', alignItems: 'center' }}>‹</Link>
          ) : null}
          <div style={{ fontSize: volver != null ? '14px' : '13px', fontWeight: volver != null ? 500 : 600, minWidth: 0 }} className="truncate">{titulo}</div>
          {derecha && <div style={{ marginLeft: 'auto', fontSize: '12.5px', color: oscuro ? '#C9C4C2' : V.apagado }}>{derecha}</div>}
        </header>
        <main style={{ flex: 1, minHeight: 0, padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>{children}</main>
        {pie && (
          <div style={{ padding: '12px 16px 18px', borderTop: `1px solid ${filo}`, flexShrink: 0, position: 'sticky', bottom: 0, background: fondo, display: 'flex', gap: 10 }}>
            {pie}
          </div>
        )}
      </div>
    </div>
  )
}

/** El botón grande del pie: 52px, amarillo. Enlace o botón según haga falta. */
export const primarioTelefono = {
  height: 52, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 6,
  background: V.marca, color: V.grafito, fontSize: '15px', fontWeight: 600, border: 0, cursor: 'pointer',
} as const
export const secundarioTelefono = {
  ...primarioTelefono, flex: '0 0 auto', padding: '0 24px', background: '#FFFFFF', border: `1px solid ${V.lineaFuerte}`, fontWeight: 500, color: V.tinta,
} as const

/** Una fila tocable de 60px (`M01:9`): icono, título, bajada, chevron. */
export function FilaTelefono({ href, icono, titulo, bajada, tonoBajada, ultima, testid }: {
  href: string
  icono?: ReactNode
  titulo: ReactNode
  bajada?: ReactNode
  tonoBajada?: string
  ultima?: boolean
  testid?: string
}) {
  return (
    <Link href={href} prefetch={false} data-testid={testid} className="active:bg-surface-quiet"
      style={{ minHeight: 60, display: 'flex', alignItems: 'center', gap: 12, borderBottom: ultima ? undefined : `1px solid ${V.linea}` }}>
      {icono}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 500 }}>{titulo}</div>
        {bajada != null && <div style={{ fontSize: '12.5px', color: tonoBajada ?? V.apagado }}>{bajada}</div>}
      </div>
      <span aria-hidden style={{ color: V.tenue }}>›</span>
    </Link>
  )
}
