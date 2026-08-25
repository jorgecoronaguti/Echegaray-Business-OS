'use client'

// LAS PIEZAS DEL PANEL DE LA TAREA — medidas en «04 · Tarea Panel lateral.dc.html».
//
// Están acá y no adentro de `PanelTarea.tsx` por una razón práctica: el panel tiene seis solapas y
// el archivo pasaba el tope de 500 líneas del repo. Lo que se repite en las seis vive junto, y así
// una medida se corrige en un lugar en vez de en seis.

import type { CSSProperties, ReactNode } from 'react'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Ico'

/** El cuadro PLAN (gris) y el cuadro REAL (verde) enfrentados. Los dos colores son del zip. */
export function Cuadro({ rotulo, tono, children }: {
  rotulo: string; tono: 'plan' | 'real'; children: ReactNode
}) {
  const real = tono === 'real'
  return (
    <div data-testid={real ? 'panel-real' : 'panel-plan'} style={{
      background: real ? C.realFondo : C.tenueFondo,
      border: `1px solid ${real ? C.realBorde : C.bordeTarjeta}`,
      borderRadius: '8px', padding: '10px 11px',
    }}>
      <div style={{
        fontSize: '10px', color: real ? C.realRotulo : C.tenue, letterSpacing: '.05em',
        marginBottom: '7px',
      }}>{rotulo}</div>
      {children}
    </div>
  )
}

/** Una fila de un cuadro: rótulo a la izquierda, valor mono a la derecha. */
export function Celda({ k, v, falta = 'sin cargar', color }: {
  k: string; v: ReactNode | null; falta?: string; color?: string
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px',
      padding: '3px 0',
    }}>
      <span style={{ fontSize: '11.5px', color: C.tintaSuave }}>{k}</span>
      <span style={{ fontFamily: MONO, fontSize: '12px', color: color ?? C.tinta, textAlign: 'right' }}>
        {v ?? <span style={{ fontFamily: 'inherit', fontSize: '11.5px', color: C.tenue, fontStyle: 'italic' }} data-nulo="">{falta}</span>}
      </span>
    </div>
  )
}

/**
 * UNA FILA DE RECURSO del Resumen: ícono · clave de 100px · valor · chevron.
 *
 * La ausencia se dice con su nombre, nunca con un guión suelto — un «—» al lado de «Responsable»
 * se lee como «nadie», y es «nadie lo cargó».
 */
export function FilaRecurso({ clave, icono, valor, falta = 'sin cargar', alerta = false, testid }: {
  clave: string; icono?: ReactNode; valor: ReactNode | null
  falta?: string; alerta?: boolean; testid?: string
}) {
  return (
    <div data-testid={testid} style={{
      display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 0',
      borderBottom: `1px solid ${C.bordeLista}`,
    }}>
      <span style={{ display: 'flex', color: C.tenue, flexShrink: 0 }} title={clave}>{icono}</span>
      <span style={{ fontSize: '11.5px', color: C.tintaSuave, width: '100px', flexShrink: 0 }}>{clave}</span>
      <span style={{
        fontSize: '12px', color: alerta ? C.warn : C.tinta, minWidth: 0, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {valor ?? <span style={{ color: C.tenue, fontStyle: 'italic' }} data-nulo="">{falta}</span>}
      </span>
    </div>
  )
}

/** Fila plegable del Resumen (Dotación, Subcontrato): resumen a la vista, detalle bajo demanda. */
export function FilaPlegable({ clave, resumen, icono, alerta = false, children, testid }: {
  clave: string; resumen: ReactNode; icono?: ReactNode
  alerta?: boolean; children: ReactNode; testid?: string
}) {
  return (
    <details data-testid={testid} style={{ borderBottom: `1px solid ${C.bordeLista}` }}>
      <summary style={{
        display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 0', cursor: 'pointer',
        listStyle: 'none',
      }}>
        <span style={{ display: 'flex', color: C.tenue, flexShrink: 0 }}>{icono}</span>
        <span style={{ fontSize: '11.5px', color: C.tintaSuave, width: '100px', flexShrink: 0 }}>{clave}</span>
        <span style={{ fontSize: '12px', color: alerta ? C.warn : C.tinta, minWidth: 0 }}>{resumen}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', color: C.fantasma, flexShrink: 0 }}>
          <Ico d={P.derecha} s={13} />
        </span>
      </summary>
      <div style={{ paddingBottom: '12px' }}>{children}</div>
    </details>
  )
}

/** El título de una sección del cuerpo del panel: 12px/600. */
export function Titulo({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: '12px', fontWeight: 600, color: C.tinta, marginBottom: '7px' }}>{children}</div>
}

/** El aviso rojo del impedimento (04): no se esconde ni cuando su solapa está cerrada. */
export function Impedimento({ titulo, detalle, href, testid }: {
  titulo: ReactNode; detalle: ReactNode; href?: string; testid?: string
}) {
  const cuerpo = (
    <>
      <span style={{ display: 'flex', color: C.neg, marginTop: '1px', flexShrink: 0 }}>
        <Ico d={P.bloqueo} s={14} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: C.tinta }}>{titulo}</span>
        <span style={{ display: 'block', fontSize: '11px', color: C.tintaSuave, marginTop: '2px' }}>{detalle}</span>
      </span>
      <span style={{ marginLeft: 'auto', display: 'flex', color: C.tenue, flexShrink: 0, alignSelf: 'center' }}>
        <Ico d={P.derecha} s={13} />
      </span>
    </>
  )
  const estilo: CSSProperties = {
    marginTop: '16px', border: `1px solid ${C.negBorde}`, background: C.negFondo, borderRadius: '8px',
    padding: '9px 10px', display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer',
  }
  return href
    ? <a href={href} data-testid={testid} style={estilo}>{cuerpo}</a>
    : <div data-testid={testid} style={estilo}>{cuerpo}</div>
}

/** Una cifra con rótulo chico: el bloque de HH del panel. */
export function Cifra({ rotulo, valor, falta, alerta = false }: {
  rotulo: string; valor: string | null; falta: string; alerta?: boolean
}) {
  return (
    <div>
      <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.05em', color: C.tenue }}>{rotulo}</div>
      <div style={{ fontFamily: MONO, fontSize: '15px', fontWeight: 600, color: alerta ? C.warn : C.tinta }}>
        {valor ?? <span style={{ fontFamily: 'inherit', fontSize: '12px', fontWeight: 400, color: C.tenue, fontStyle: 'italic' }} data-nulo="">{falta}</span>}
      </div>
    </div>
  )
}

/** El botón de ícono de 30×30 con borde del encabezado del panel (adjuntar, foto). */
export function BotonIcono({ titulo, testid, d, onClick }: {
  titulo: string; testid?: string; d: ReactNode; onClick: () => void
}) {
  return (
    <button type="button" title={titulo} aria-label={titulo} data-testid={testid} onClick={onClick}
      style={{
        width: '30px', height: '30px', borderRadius: '6px', border: `1px solid ${C.borde}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.tintaSuave,
        cursor: 'pointer', background: C.superficie, flexShrink: 0,
      }}>
      <Ico d={d} s={15} />
    </button>
  )
}
