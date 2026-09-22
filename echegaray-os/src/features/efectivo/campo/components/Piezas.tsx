import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { C, R } from '@/shared/components/movil/tokens'
import { Icono, type NombreIcono } from '@/shared/components/movil/Iconos'
import { MONO, mono } from '@/shared/components/movil/Piezas'
import { MIGRACION_EFECTIVO, estadoVisible, fechaDelTicket, cifra, totalDelTicket, type Tono } from '../logica'
import type { TicketRendicion } from '../tipos'

// LAS PIEZAS DE M01–M08, MEDIDAS EN `docs/diseno/efectivo-a-rendir/efectivo-a-rendir.dc.html`.
//
// Lo que ya existe en el kit del teléfono (`shared/components/movil`) se usa de ahí: tarjeta, topbar,
// barra, pastilla. Acá queda lo que es propio de este módulo y se repite en sus pantallas: la
// versalita mono de 10,5, la cifra de 34, el renglón «rótulo · valor» de 14, los dos botones del
// tercio inferior (amarillo de 52–56 y contorno de 48) y la fila de ticket de M06.

export const TONO: Record<Tono, string> = { faint: C.muted, warn: C.warn, pos: C.pos, neg: C.neg }

/** La versalita del mockup: `IBM Plex Mono 10,5 · letter-spacing .06em · #91918B · uppercase`. */
export function Rotulo({ children, color = C.faint }: { children: ReactNode; color?: string }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.06em', color, textTransform: 'uppercase' }}>
      {children}
    </div>
  )
}

/** La cifra grande de M01, M03 y M08: 34/600 mono con `letter-spacing:-.02em`. */
export function CifraGrande({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <div data-testid={testid} style={{ ...mono, fontSize: 34, fontWeight: 600, letterSpacing: '-.02em', color: C.ink }}>
      {children}
    </div>
  )
}

/** `Para · Galpón 8`: rótulo `muted` a la izquierda, valor a la derecha, 14px. */
export function Renglon({ rotulo, valor, numero, color = C.ink, testid }: {
  rotulo: ReactNode; valor: ReactNode; numero?: boolean; color?: string; testid?: string
}) {
  return (
    <div data-testid={testid} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
      <span style={{ color: C.muted }}>{rotulo}</span>
      <span style={{ color, textAlign: 'right', ...(numero ? mono : {}) }}>{valor}</span>
    </div>
  )
}

/** La tarjeta de M01–M08: blanca, radio 14, `padding:18px` (o `16px 18px` en las chicas). */
export function Caja({ children, borde = C.linea, fondo = C.surface, gap = 14, relleno = 18, testid, style }: {
  children: ReactNode; borde?: string; fondo?: string; gap?: number; relleno?: number | string; testid?: string
  style?: CSSProperties
}) {
  return (
    <div
      data-testid={testid}
      style={{
        background: fondo, border: `1px solid ${borde}`, borderRadius: R.tarjeta, padding: relleno,
        display: 'flex', flexDirection: 'column', gap, ...style,
      }}
    >
      {children}
    </div>
  )
}

const BOTON: CSSProperties = {
  width: '100%', borderRadius: R.control, display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 10, fontFamily: 'inherit', cursor: 'pointer',
}

/** La primaria amarilla del tercio inferior. Con `href` es un enlace; sin él, un botón. */
export function Primario({ children, href, alto = 56, icono, activo = true, onClick, tipo = 'button', testid }: {
  children: ReactNode; href?: string; alto?: number; icono?: NombreIcono; activo?: boolean
  onClick?: () => void; tipo?: 'button' | 'submit'; testid?: string
}) {
  const estilo: CSSProperties = {
    ...BOTON, minHeight: alto, fontSize: 16, fontWeight: 600, border: 'none',
    background: activo ? C.marca : C.inerte, color: activo ? C.ink : C.faint,
    cursor: activo ? 'pointer' : 'not-allowed',
  }
  const cuerpo = <>{icono && <Icono nombre={icono} tamano={20} grosor={2.4} />}{children}</>
  if (href && activo) return <Link href={href} prefetch={false} data-testid={testid} style={estilo}>{cuerpo}</Link>
  return <button type={tipo} disabled={!activo} onClick={onClick} data-testid={testid} style={estilo}>{cuerpo}</button>
}

/** La secundaria de contorno de 48px. */
export function Contorno({ children, href, onClick, alto = 48, tipo = 'button', activo = true, testid }: {
  children: ReactNode; href?: string; onClick?: () => void; alto?: number; tipo?: 'button' | 'submit'
  activo?: boolean; testid?: string
}) {
  const estilo: CSSProperties = {
    ...BOTON, minHeight: alto, fontSize: 15, border: `1px solid ${C.lineaFuerte}`, background: C.surface,
    color: activo ? C.inkSuave : C.faint, cursor: activo ? 'pointer' : 'not-allowed',
  }
  if (href) return <Link href={href} prefetch={false} data-testid={testid} style={estilo}>{children}</Link>
  return <button type={tipo} onClick={onClick} disabled={!activo} data-testid={testid} style={estilo}>{children}</button>
}

/** Una fila de acceso de M03 (`Mis rendiciones ›`): 52px, borde propio, cuenta en ámbar. */
export function FilaAcceso({ href, children, cuenta, testid }: {
  href: string; children: ReactNode; cuenta?: number; testid?: string
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      data-testid={testid}
      style={{
        minHeight: 52, background: C.surface, border: `1px solid ${C.linea}`, borderRadius: R.control,
        padding: '0 16px', display: 'flex', alignItems: 'center', fontSize: 15, color: C.ink,
      }}
    >
      {children}
      {!!cuenta && <span style={{ ...mono, fontSize: 12, color: C.warn, marginLeft: 8 }}>{cuenta}</span>}
      <span style={{ marginLeft: 'auto', display: 'flex', color: C.tenue }}><Icono nombre="siguiente" tamano={18} /></span>
    </Link>
  )
}

/**
 * UNA FILA DE M06: el comercio (o lo que falta), `21/09 · te lo piden` y el importe.
 *
 * La que pide un dato se marca como en el mockup —fondo ámbar tenue con la raya de 3px a la
 * izquierda— y es la única que dice qué hacer. Todas llevan al detalle del ticket.
 */
export function FilaTicket({ t, href, ultima }: { t: TicketRendicion; href: string; ultima?: boolean }) {
  const v = estadoVisible(t)
  const total = totalDelTicket(t)
  return (
    <Link
      href={href}
      prefetch={false}
      data-testid="fila-ticket"
      data-estado={t.estado}
      style={{
        minHeight: 66, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, color: C.ink,
        borderBottom: ultima ? 'none' : `1px solid ${C.divisor}`,
        background: v.pideDato ? C.warnFondo : 'transparent',
        boxShadow: v.pideDato ? `inset 3px 0 0 ${C.warn}` : 'none',
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: 14.5, fontWeight: 500, color: v.pideDato ? C.warn : C.ink,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {v.titulo}
        </span>
        <span style={{ display: 'block', fontSize: 12.5, color: v.tono === 'faint' || v.tono === 'warn' ? C.muted : TONO[v.tono] }}>
          {fechaDelTicket(t)} · {v.etiqueta}
        </span>
      </span>
      <span style={{ ...mono, fontSize: 14.5, color: total == null ? C.faint : C.ink }}>
        {total == null ? '—' : cifra(total)}
      </span>
    </Link>
  )
}

/** El módulo todavía no está en la base: se dice, no se pinta un cero. */
export function SinPublicar({ testid = 'efectivo-sin-publicar' }: { testid?: string }) {
  return (
    <Caja testid={testid} gap={9} relleno="16px 18px">
      <Rotulo>Todavía no publicado</Rotulo>
      <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>Efectivo a rendir todavía no está en la base</div>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
        Falta aplicar la migración {MIGRACION_EFECTIVO}. Cuando esté, tus entregas y tus tickets aparecen acá solos.
      </div>
    </Caja>
  )
}

/** La columna de una pantalla de M01–M08: `padding:16px`, `gap:14px`, alto completo para empujar el pie. */
export function Columna({ children, conPie }: { children: ReactNode; conPie?: boolean }) {
  return (
    <div style={{
      padding: 16, display: 'flex', flexDirection: 'column', gap: 14,
      minHeight: conPie ? 'calc(100vh - 64px)' : undefined,
    }}>
      {children}
    </div>
  )
}

/** El bloque del tercio inferior: `margin-top:auto` lo baja al pie de la pantalla. */
export function Pie({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>{children}</div>
}
