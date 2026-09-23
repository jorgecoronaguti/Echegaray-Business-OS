'use client'

// LAS PIEZAS QUE LAS PANTALLAS DE ARMADO (C01–C10 · MC1–MC11) REPITEN, medidas en sus fragmentos.
//
//   eyebrow     mono 10,5px / .06em / uppercase / faint
//   chip        32px (36 en el teléfono), `padding:0 12px`, radio 6; activo con borde grafito y 500,
//               apagado con borde line y texto muted
//   campo       rótulo 12px muted (y una nota faint a la derecha) + control de 32px (44 en el teléfono)
//   casilla     14px (16 en el teléfono), radio 3, borde 1,5px; marcada llena grafito con tilde
//   aviso       ícono 13px + texto 12,5px (warn con triángulo · ok con tilde verde)
//   barra       6px, radio 3, canal line
//   pie         (teléfono) `padding:12px 16px 18px`, línea arriba, primaria de 48px; apagada sobre line
//   cabecera    (teléfono) `padding:12px 16px`, «‹» 16px, miga 11,5 faint, título 15/600

import type { CSSProperties, ReactNode } from 'react'
import { C, MONO } from '../../canon/tokens'
import { Ico, P } from '../../canon/Ico'

export const EYEBROW: CSSProperties = { fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase' }

export function Eyebrow({ children, derecha }: { children: ReactNode; derecha?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
      <div style={EYEBROW}>{children}</div>
      {derecha != null && <div style={{ fontSize: '12px', color: C.tintaSuave }}>{derecha}</div>}
    </div>
  )
}

export function Chip({ activo, apagado = false, onClick, icono, children, testid, alto = 32, titulo }: {
  activo: boolean; apagado?: boolean; onClick: () => void; icono?: ReactNode; children: ReactNode
  testid?: string; alto?: 32 | 36; titulo?: string
}) {
  return (
    <button type="button" onClick={onClick} disabled={apagado} aria-pressed={activo} data-testid={testid} title={titulo}
      style={{
        height: `${alto}px`, padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
        border: `1px solid ${activo ? C.grafito : C.borde}`, borderRadius: '6px', fontSize: '12.5px',
        fontWeight: activo ? 500 : 400, color: activo ? C.tinta : C.tintaSuave, background: C.superficie,
        cursor: apagado ? 'default' : 'pointer', font: 'inherit', opacity: apagado ? 0.5 : 1, flexShrink: 0,
      }}>
      {icono}{children}
    </button>
  )
}

export function Campo({ rotulo, nota, children, span2 = false, alto = 32 }: {
  rotulo: string; nota?: ReactNode; children: ReactNode; span2?: boolean; alto?: 32 | 44
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', gridColumn: span2 ? 'span 2' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: C.tintaSuave }}>
        <span>{rotulo}</span>
        {nota != null && <span style={{ color: C.tenue }}>{nota}</span>}
      </div>
      <div style={{ '--alto': `${alto}px` } as CSSProperties}>{children}</div>
    </div>
  )
}

/** El control del diseño: 32px (44), borde line-strong, radio 6, 13px (14); mono cuando es número o fecha. */
export function estiloControl(alto: 32 | 44, mono = false): CSSProperties {
  return {
    height: `${alto}px`, width: '100%', padding: alto === 44 ? '0 12px' : '0 10px', border: `1px solid ${C.bordeFuerte}`,
    borderRadius: '6px', fontSize: alto === 44 ? '14px' : '13px', fontFamily: mono ? MONO : 'inherit', color: C.tinta,
    background: C.superficie, outline: 'none', boxSizing: 'border-box',
  }
}

export function Casilla({ marcada, onClick, etiqueta, testid, tam = 14, apagada = false }: {
  marcada: boolean; onClick: () => void; etiqueta: string; testid?: string; tam?: 14 | 16; apagada?: boolean
}) {
  return (
    <button type="button" role="checkbox" aria-checked={marcada} aria-label={etiqueta} data-testid={testid} disabled={apagada}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        width: `${tam}px`, height: `${tam}px`, border: `1.5px solid ${marcada ? C.grafito : C.bordeFuerte}`, borderRadius: '3px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', background: marcada ? C.grafito : C.superficie,
        color: C.superficie, padding: 0, cursor: apagada ? 'default' : 'pointer', flexShrink: 0, opacity: apagada ? 0.4 : 1,
      }}>
      {marcada && <Ico d={P.ok} s={tam === 16 ? 11 : 10} />}
    </button>
  )
}

export function Aviso({ tono, children, tam = 13 }: { tono: 'warn' | 'ok' | 'muted'; children: ReactNode; tam?: 12 | 13 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: tam === 13 ? '12.5px' : '12px', color: tono === 'warn' ? C.warn : C.tintaSuave }}>
      <span style={{ display: 'flex', color: tono === 'ok' ? C.pos : tono === 'warn' ? C.warn : C.tenue }}>
        <Ico d={tono === 'ok' ? P.ok : tono === 'warn' ? P.alerta : P.pend} s={tam} />
      </span>
      {children}
    </div>
  )
}

export function Barra6({ pct, color, ancho }: { pct: number; color: string; ancho?: string }) {
  return (
    <div style={{ width: ancho, height: '6px', borderRadius: '3px', background: C.borde, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color }} />
    </div>
  )
}

/** Un valor ausente, dicho con su palabra en itálica tenue. */
export function Falta({ children }: { children: ReactNode }) {
  return <span style={{ color: C.tenue, fontStyle: 'italic' }} data-nulo="">{children}</span>
}

/** EL PIE DEL TELÉFONO: la primaria de 48px sobre la barra de abajo (que mide 64px). */
export function PiePrimaria({ rotulo, icono, onClick, apagada = false, nota, testid, pendiente = false }: {
  rotulo: string; icono: ReactNode; onClick: () => void; apagada?: boolean; nota?: string | null; testid: string; pendiente?: boolean
}) {
  return (
    <div className="flex md:hidden" data-testid={`${testid}-pie`} style={{
      position: 'fixed', left: 0, right: 0, bottom: '64px', flexDirection: 'column', padding: '12px 16px 18px',
      background: C.superficie, borderTop: `1px solid ${C.borde}`, zIndex: 20,
    }}>
      <button type="button" onClick={onClick} disabled={apagada || pendiente} data-testid={testid} aria-disabled={apagada}
        style={{
          height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: '6px',
          background: apagada ? C.borde : C.marca, color: apagada ? C.tenue : C.grafito, fontSize: '14px', fontWeight: 600,
          border: 0, font: 'inherit', width: '100%', cursor: apagada ? 'default' : 'pointer', opacity: pendiente ? 0.7 : 1,
        }}>
        {icono}{pendiente ? 'Guardando…' : rotulo}
      </button>
      {nota && <div style={{ fontSize: '12px', color: C.tenue, textAlign: 'center', marginTop: '8px' }}>{nota}</div>}
    </div>
  )
}

/** LA CABECERA DE UN PANEL A PANTALLA COMPLETA EN EL TELÉFONO (MC3 · MC4 · MC8 · MC9). */
export function CabeceraTelefono({ miga, titulo, alVolver }: { miga: ReactNode; titulo: ReactNode; alVolver: () => void }) {
  return (
    <div className="flex md:hidden" style={{ padding: '12px 16px', borderBottom: `1px solid ${C.borde}`, alignItems: 'center', gap: '10px', background: C.superficie }}>
      <button type="button" onClick={alVolver} aria-label="Volver" data-testid="volver-telefono"
        style={{ color: C.tintaSuave, display: 'flex', border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>
        <Ico d={P.izquierda} s={16} />
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
        <div style={{ fontSize: '11.5px', color: C.tenue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{miga}</div>
        <div style={{ fontSize: '15px', fontWeight: 600, color: C.tinta }}>{titulo}</div>
      </div>
    </div>
  )
}

/** El resultado de una acción, a la vista hasta la siguiente. */
export function Resultado({ r }: { r: { ok: boolean; texto: string } | null }) {
  if (!r) return null
  return (
    <p data-testid="resultado-accion" role="status" style={{
      margin: 0, borderLeft: `3px solid ${r.ok ? C.pos : C.neg}`, background: r.ok ? C.posFondo : C.negFondo,
      padding: '8px 12px', fontSize: '12.5px', color: r.ok ? C.pos : C.neg,
    }}>{r.texto}</p>
  )
}

export const ESTILO_SECUNDARIA_32: CSSProperties = {
  height: '32px', padding: '0 12px', border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', background: C.superficie,
  font: 'inherit', fontSize: '13px', color: C.tintaMedia, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
}

export const ESTILO_PRIMARIA_32: CSSProperties = {
  height: '32px', padding: '0 14px', border: 0, borderRadius: '6px', background: C.marca, color: C.grafito,
  font: 'inherit', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '7px',
}
