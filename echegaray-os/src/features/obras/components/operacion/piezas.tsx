// LAS PIEZAS DE OPERACIÓN Y DOCUMENTOS — medidas del diseño ERP Obras (09–12 · 14 · M12–M15 · M17).
//
// Sin `'use client'`: las montan componentes cliente y servidor por igual. Nada acá decide qué dato
// se muestra; sólo cómo se dibuja lo que ya vino decidido de `operacionCanon.ts`.

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Ico'
import type { Tono } from '../../services/operacionCanon'

/** El color de cada tono del canon. `tinta` es texto sin color semántico. */
export const COLOR_TONO: Record<Tono, string> = {
  pos: C.pos, curso: C.curso, warn: C.warn, neg: C.neg, tenue: C.tenue, tinta: C.tinta,
}

/** Eyebrow: mono 10,5 / .06em / uppercase / faint. */
export const EYEBROW: CSSProperties = {
  fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase',
}

export function Eyebrow({ children, derecha }: { children: ReactNode; derecha?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
      <div style={EYEBROW}>{children}</div>
      {derecha != null && <div style={{ fontSize: '12px', color: C.tintaSuave }}>{derecha}</div>}
    </div>
  )
}

/** El título de un bloque de escritorio (11 · 14): 14px 600 con su meta en 12,5 al lado. */
export function TituloBloque({ titulo, meta, derecha }: { titulo: string; meta?: ReactNode; derecha?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: C.tinta }}>{titulo}</div>
        {meta != null && <div style={{ fontSize: '12.5px', color: C.tintaSuave }}>{meta}</div>}
      </div>
      {derecha}
    </div>
  )
}

/** La cabecera de una grilla de escritorio: eyebrow por columna, 34px (32 en el 11), línea abajo. */
export function GridCab({ columnas, gap = 20, alto = 34, celdas }: {
  columnas: string
  gap?: number
  alto?: number
  celdas: { t: string; der?: boolean }[]
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: columnas, gap: `${gap}px`, height: `${alto}px`, alignItems: 'center',
      borderBottom: `1px solid ${C.borde}`, ...EYEBROW,
    }}>
      {celdas.map((c) => <div key={c.t} style={c.der ? { textAlign: 'right' } : undefined}>{c.t}</div>)}
    </div>
  )
}

/** Una fila de grilla de escritorio. El borde izquierdo de 2px es el del diseño para vencido/abierto. */
export function GridFila({
  columnas, gap = 20, alto, ultima = false, bordeIzq, sangria = 14, onClick, testid, children, seleccionada = false, atributos,
}: {
  columnas: string
  gap?: number
  alto: number
  ultima?: boolean
  /** Color del borde izquierdo de 2px (09 · 11). Sin él la fila lleva el mismo `padding-left`. */
  bordeIzq?: string | null
  /** Con borde: `padding-left` y `margin-left` negativo iguales a los del diseño (14/−16 · 12/−14). */
  sangria?: number
  onClick?: () => void
  testid?: string
  seleccionada?: boolean
  atributos?: Record<string, string | undefined>
  children: ReactNode
}) {
  const conSangria = sangria > 0
  return (
    <div
      data-testid={testid}
      data-seleccionada={seleccionada ? '1' : undefined}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      {...atributos}
      style={{
        display: 'grid', gridTemplateColumns: columnas, gap: `${gap}px`, minHeight: `${alto}px`, alignItems: 'center',
        borderBottom: ultima ? 'none' : `1px solid ${C.borde}`, fontSize: '13.5px', color: C.tinta,
        borderLeft: `2px solid ${bordeIzq ?? 'transparent'}`,
        paddingLeft: conSangria ? `${sangria}px` : 0, marginLeft: conSangria ? `-${sangria + 2}px` : 0,
        cursor: onClick ? 'pointer' : 'default',
        background: seleccionada ? C.marcaSuave : 'transparent',
      }}
    >
      {children}
    </div>
  )
}

/** Texto de celda con tono. `sub` = 12,5px (la columna «Traba», «Se convirtió en»). */
export function Celda({ tono = 'tinta', sub = false, peso, mono = false, der = false, children }: {
  tono?: Tono | 'media' | 'suave'
  sub?: boolean
  peso?: 500 | 600
  mono?: boolean
  der?: boolean
  children: ReactNode
}) {
  const color = tono === 'media' ? C.tintaMedia : tono === 'suave' ? C.tintaSuave : COLOR_TONO[tono]
  return (
    <div style={{
      color, fontSize: sub ? '12.5px' : undefined, fontWeight: peso, fontFamily: mono ? MONO : undefined,
      textAlign: der ? 'right' : undefined, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      fontVariantNumeric: 'tabular-nums',
    }}>{children}</div>
  )
}

/** «sin cargar», «sin asignar»: el vacío escrito en faint. NULL nunca es 0. */
export function Falta({ children, italica = false }: { children: ReactNode; italica?: boolean }) {
  return <span style={{ color: C.tenue, fontStyle: italica ? 'italic' : undefined }} data-nulo="">{children}</span>
}

/**
 * LA PASTILLA DEL TELÉFONO (M12–M15 · M17): 44px (36 en el diseño; el dueño fijó 44 de toque en el teléfono), `padding 0 12px`, radio 6, borde grafito y 500
 * cuando está activa, `#E7E6E2` y tinta suave cuando no. El conteo va en mono 11 faint.
 */
export function PastillaM({ activa, onClick, href, icono, n, testid, children }: {
  activa: boolean
  onClick?: () => void
  href?: string
  icono?: ReactNode
  n?: number | null
  testid?: string
  children: ReactNode
}) {
  const estilo: CSSProperties = {
    font: 'inherit', height: '44px', padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
    border: `1px solid ${activa ? C.grafito : C.borde}`, borderRadius: '6px', fontSize: '12.5px',
    fontWeight: activa ? 500 : 400, color: activa ? C.tinta : C.tintaSuave, background: C.superficie,
    cursor: 'pointer', flexShrink: 0,
  }
  const cuerpo = (
    <>
      {icono}{children}
      {n != null && <span style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue }}>{n}</span>}
    </>
  )
  if (href) {
    // Las pastillas de nivel 3 navegan: se dibujan como enlace, pero el `<Link>` lo pone el llamador.
    return <span data-testid={testid} aria-current={activa ? 'page' : undefined} style={estilo}>{cuerpo}</span>
  }
  return (
    <button type="button" onClick={onClick} data-testid={testid} aria-pressed={activa} style={estilo}>{cuerpo}</button>
  )
}

/** La fila corrible de pastillas del teléfono: `gap 8`, `margin-right −16` para que la última se corte. */
export function FilaPastillas({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <div data-testid={testid} style={{
      display: 'flex', gap: '8px', overflowX: 'auto', marginRight: '-16px', scrollbarWidth: 'none', paddingRight: '16px',
    }}>{children}</div>
  )
}

/**
 * LA FILA DEL TELÉFONO (M12–M15): icono 15 a la izquierda, título 13,5/14 con su sublínea 12 en
 * tinta suave, y lo de la derecha alineado al final. `min-height` 60 (64 en impedimentos, 52 en
 * «Qué bloquea», 46 en papeles del cliente).
 */
export function FilaM({
  alto = 60, icono, iconoColor, titulo, sub, derecha, ultima = false, onClick, testid, tamTitulo = 14,
}: {
  alto?: number
  icono?: ReactNode
  iconoColor?: string
  titulo: ReactNode
  sub?: ReactNode
  derecha?: ReactNode
  ultima?: boolean
  onClick?: () => void
  testid?: string
  tamTitulo?: number
}) {
  return (
    <div data-testid={testid} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      style={{
        minHeight: `${alto}px`, display: 'flex', alignItems: 'center', gap: '10px',
        borderBottom: ultima ? 'none' : `1px solid ${C.borde}`, cursor: onClick ? 'pointer' : 'default',
      }}>
      {icono != null && <span style={{ color: iconoColor ?? C.tenue, display: 'flex', flexShrink: 0 }}>{icono}</span>}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div style={{ fontSize: `${tamTitulo}px`, color: C.tinta, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titulo}</div>
        {sub != null && <div style={{ fontSize: '12px', color: C.tintaSuave, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
      {derecha != null && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0, textAlign: 'right' }}>{derecha}</div>
      )}
    </div>
  )
}

/** El texto de la derecha de una `FilaM`: estado en 12 con tono y/o fecha en mono 12 faint. */
export function DerechaM({ texto, tono = 'tenue', fecha, peso }: { texto?: string; tono?: Tono; fecha?: string | null; peso?: 500 }) {
  return (
    <>
      {texto != null && <span style={{ fontSize: '12px', color: COLOR_TONO[tono], fontWeight: peso, whiteSpace: 'nowrap' }}>{texto}</span>}
      {fecha != null && <span style={{ fontFamily: MONO, fontSize: '12px', color: C.tenue }}>{fecha}</span>}
    </>
  )
}

/** El pie gris del teléfono (M13 · M15): 12px faint. */
export function PieM({ children, testid }: { children: ReactNode; testid?: string }) {
  return <div data-testid={testid} style={{ fontSize: '12px', color: C.tenue }}>{children}</div>
}

/** LA PRIMARIA DEL TELÉFONO (M12): 48px amarilla sobre la barra, en su banda blanca con línea arriba. */
export function PrimariaTelefono({ href, testid, icono = P.mas, children }: {
  href: string; testid?: string; icono?: ReactNode; children: ReactNode
}) {
  return (
    <div className="flex md:hidden" style={{
      position: 'fixed', left: 0, right: 0, bottom: '64px', padding: '12px 16px 18px', background: C.superficie,
      borderTop: `1px solid ${C.borde}`, zIndex: 20,
    }}>
      {/* `<Link>` y no `<a href>`: regla del repo para todo destino interno. */}
      <Link href={href} prefetch={false} data-testid={testid} style={{
        height: '48px', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        borderRadius: '6px', background: C.marca, color: C.grafito, fontSize: '14px', fontWeight: 600,
      }}>
        <Ico d={icono} s={15} />{children}
      </Link>
    </div>
  )
}
