'use client'

// LAS PIEZAS DEL PANEL DE LA TAREA — medidas en «04 · Tarea Panel lateral.dc.html».
//
// Están acá y no adentro de `PanelTarea.tsx` por una razón práctica: el panel tiene seis solapas y
// el archivo pasaba el tope de 500 líneas del repo. Lo que se repite en las seis vive junto, y así
// una medida se corrige en un lugar en vez de en seis.

import Link from 'next/link'
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
    ? <Link prefetch={false} href={href} data-testid={testid} style={estilo}>{cuerpo}</Link>
    : <div data-testid={testid} style={estilo}>{cuerpo}</div>
}

/** Una cifra con rótulo chico: el bloque de HH del panel. */
export function Cifra({ rotulo, valor, falta, alerta = false, sub }: {
  rotulo: string; valor: string | null; falta: string; alerta?: boolean
  /** De dónde sale la cifra («del análisis», «por asistencia»): 11px tenue, debajo. */
  sub?: string
}) {
  return (
    <div>
      <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.05em', color: C.tenue }}>{rotulo}</div>
      {/* EL FALTANTE NO VA EN MONO: `fontFamily:'inherit'` adentro de un bloque mono hereda la mono. */}
      <div style={{ fontFamily: valor == null ? undefined : MONO, fontSize: '15px', fontWeight: 600, color: alerta ? C.warn : C.tinta }}>
        {valor ?? <span style={{ fontSize: '12px', fontWeight: 400, color: C.tenue, fontStyle: 'italic' }} data-nulo="">{falta}</span>}
      </div>
      {sub && <div style={{ fontSize: '11px', color: C.tenue, marginTop: '1px' }}>{sub}</div>}
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

// ═══ LAS PIEZAS DE LAS SOLAPAS QUE EL ZIP NO DIBUJA (24/09/2026) ═══
//
// El 04 dibuja sólo el Resumen. Avance, Dependencias, Rendimiento y la dotación plegada se
// diseñaron con lo que el 04 ya fija: el eyebrow mono de «Lo que la traba», la fila de lista con
// `bordeLista`, el texto secundario 12px muted y el plegable con chevron. Viven acá para que las
// cuatro solapas se lean como una sola pantalla.

/** El rótulo de sección del 04 («LO QUE LA TRABA»): mono 10,5 / .06em / mayúsculas / faint. */
export function Eyebrow({ children, derecha }: { children: ReactNode; derecha?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
      <div style={{ fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase' }}>{children}</div>
      {derecha != null && <div style={{ fontSize: '11.5px', color: C.tenue }}>{derecha}</div>}
    </div>
  )
}

/** Texto secundario de una solapa: 12px muted, 1,5 de interlínea. Nunca más de dos renglones. */
export function Nota({ children, testid, tono }: { children: ReactNode; testid?: string; tono?: 'warn' | 'neg' }) {
  return (
    <p data-testid={testid} style={{
      margin: 0, fontSize: '12px', lineHeight: 1.5, color: tono === 'warn' ? C.warn : tono === 'neg' ? C.neg : C.tintaSuave,
    }}>{children}</p>
  )
}

/** Un plegable dentro de una solapa: chevron 12 + rótulo 12px. Lo que se toca poco, a un clic. */
export function Plegado({ rotulo, children, testid, fuerte = false }: {
  rotulo: ReactNode; children: ReactNode; testid?: string; fuerte?: boolean
}) {
  return (
    <details data-testid={testid}>
      <summary style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer', listStyle: 'none',
        fontSize: fuerte ? '12.5px' : '12px', fontWeight: fuerte ? 500 : 400, color: fuerte ? C.tinta : C.tintaSuave,
      }}>
        <span style={{ display: 'flex', color: C.tenue }}><Ico d={P.derecha} s={12} /></span>
        {rotulo}
      </summary>
      <div style={{ marginTop: '10px' }}>{children}</div>
    </details>
  )
}

/** Un enlace de texto de una solapa: 12,5/500 tinta con flecha, como «Ver historial». */
export const ESTILO_ENLACE: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', fontWeight: 500, color: C.tinta,
  textDecoration: 'none', cursor: 'pointer',
}

/** Una fila clave · valor de lista (cadena de esfuerzo, restricciones): clave 12,5 con su fuente
 *  debajo en 11 faint, valor mono a la derecha. Un valor ausente se dice con su palabra. */
export function FilaDato({ clave, fuente, valor, falta = 'sin dato', destacado = false, color }: {
  clave: ReactNode; fuente?: ReactNode; valor: ReactNode | null; falta?: string; destacado?: boolean; color?: string
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', padding: '8px 0',
      borderBottom: `1px solid ${C.bordeLista}`,
    }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '12.5px', color: destacado ? C.tinta : C.tintaMedia }}>{clave}</span>
        {fuente && <span style={{ display: 'block', fontSize: '11px', color: C.tenue, marginTop: '1px' }}>{fuente}</span>}
      </span>
      <span style={{
        flexShrink: 0, textAlign: 'right', fontFamily: valor == null ? undefined : MONO, fontSize: '12.5px',
        // Destacar es peso, no color: el ámbar es sólo para un problema (regla del dueño).
        fontWeight: destacado ? 600 : 400, color: color ?? C.tinta,
      }}>
        {valor ?? <span style={{ fontSize: '11.5px', fontWeight: 400, fontStyle: 'italic', color: C.tenue }} data-nulo="">{falta}</span>}
      </span>
    </div>
  )
}
