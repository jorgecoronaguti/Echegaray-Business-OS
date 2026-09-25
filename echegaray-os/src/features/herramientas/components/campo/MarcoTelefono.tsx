// EL MARCO DE LAS PANTALLAS DE TELÉFONO DE HERRAMIENTAS (M01–M14).
//
// Sigue a `src/app/campo/marco.tsx` —una columna, 16px de costado, objetivos de 44px o más— con la
// anatomía del diseño: barra de 46px arriba (volver + título), contenido con `padding:18px 16px`, y la
// acción primaria fija abajo, 52px, al alcance del pulgar (`M01:17`, `M03:22`).

import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { BarraTelefono } from '@/shared/components/BarraTelefono'
import type { ItemBarraTelefono } from '@/features/auth/types/barraTelefono'
import { V } from '../estilo'

/** Alto de la barra del nivel (`BarraContextos`: 48 + 6 + 10 + filo). Lo fijo de abajo se apoya encima. */
export const ALTO_BARRA_NIVEL = 66

export function MarcoTelefono({ titulo, volver, pie, oscuro, children, derecha, barra }: {
  titulo: ReactNode
  /** `null` = pantalla de entrada: se dibuja el nombre del módulo en vez de la flecha. */
  volver: string | null
  pie?: ReactNode
  oscuro?: boolean
  derecha?: ReactNode
  children: ReactNode
  /**
   * La barra de abajo del nivel (regla del 24/09: una sola barra por nivel en todo el teléfono). Va en las
   * pantallas de NAVEGACIÓN (inicio, lugar, lista, búsqueda, ficha, movimientos); las de TAREA (mover,
   * alta, verificar, revisión, recuento, reportar, cámara) no la llevan: su pie es la confirmación del
   * paso y una barra de destinos al lado invitaría a salir a mitad de la carga.
   */
  barra?: ItemBarraTelefono[]
}) {
  const fondo = oscuro ? '#1F1F1E' : '#FFFFFF'
  const tinta = oscuro ? '#FFFFFF' : V.tinta
  const filo = oscuro ? '#30302F' : V.linea
  const conBarra = !!barra?.length
  // Lo fijo de abajo (el pie, o la barra de «Mover» de una lista) se apoya ENCIMA de la barra del nivel.
  const base = { '--barra-nivel': `${conBarra ? ALTO_BARRA_NIVEL : 0}px` } as CSSProperties
  return (
    <div style={{ ...base, minHeight: '100dvh', background: fondo, color: tinta, display: 'flex', flexDirection: 'column', paddingBottom: conBarra ? ALTO_BARRA_NIVEL : 0 }}>
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
          <div style={{ padding: '12px 16px 18px', borderTop: `1px solid ${filo}`, flexShrink: 0, position: 'sticky', bottom: 'var(--barra-nivel, 0px)', background: fondo, display: 'flex', gap: 10 }}>
            {pie}
          </div>
        )}
      </div>
      {conBarra && <BarraTelefono items={barra!} />}
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
