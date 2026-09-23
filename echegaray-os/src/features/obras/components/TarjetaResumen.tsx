// LA TARJETA DEL RESUMEN — el contenedor que el canónico 02 usa para TODOS sus bloques.
//
// ═══ PORTE LITERAL (24/08/2026) ═══
//
// Los valores salen medidos de «02 · Obra Resumen.dc.html» y no del design system:
//   tarjeta    `background:#FFFFFF; border:1px solid #E7E6E2; borderRadius:10px; overflow:hidden`
//   cabecera   `padding:11px 16px; borderBottom:1px solid #EFEEEA; gap:9px`
//   título     13px/600 `#1F1F1E`; la cifra en mono de 11,5px `#6B6B67`
// El radio del DS (`rounded-card`) y su `border-line` daban una tarjeta parecida y no igual, que es
// exactamente lo que el dueño rechazó cuatro veces.
//
// El Resumen venía dibujado sin recuadros: cada bloque era un eyebrow con un hairline arriba, todos
// sobre el mismo blanco. Eso funciona en una columna, pero el 02 pone siete bloques en dos columnas
// y sin marco no se ve dónde termina uno y empieza el otro — «Preparación» se leía como el pie de
// «La obra». El zip resuelve con una sola forma repetida: superficie blanca sobre el canvas cálido,
// hairline `line`, radio de card, y un encabezado separado por un divisor más suave (`sunken`).
//
// El encabezado es siempre el mismo renglón: ícono opcional · título · cifra en mono · lo que se
// pueda hacer, empujado a la derecha. No hay una segunda variante: dos encabezados parecidos pero
// distintos es como una pantalla empieza a tener dos sistemas visuales.

import type { ReactNode } from 'react'
import { C, MONO } from './canon/tokens'

export function Tarjeta({ children, testid, className = '' }: {
  children: React.ReactNode
  testid?: string
  className?: string
}) {
  return (
    <section
      data-testid={testid}
      className={className}
      style={{
        background: C.superficie, border: `1px solid ${C.borde}`, borderRadius: '10px',
        overflow: 'hidden',
      }}
    >
      {children}
    </section>
  )
}

/** El encabezado de una tarjeta: ícono · título · cifra · acción. */
export function CabeceraTarjeta({ icono, titulo, cifra, tonoCifra = 'muted', accion }: {
  icono?: React.ReactNode
  titulo: string
  /** La cifra del encabezado va en mono: es un conteo, no una palabra. */
  cifra?: React.ReactNode
  tonoCifra?: 'muted' | 'warn' | 'neg' | 'pos'
  accion?: React.ReactNode
}) {
  const TONO = { muted: C.tintaSuave, warn: C.warn, neg: C.neg, pos: C.pos } as const
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '9px', padding: '11px 16px',
      borderBottom: `1px solid ${C.bordeTarjeta}`,
    }}>
      {icono && <span style={{ display: 'flex', flexShrink: 0, color: C.tintaSuave }}>{icono}</span>}
      <h3 style={{ fontSize: '13px', fontWeight: 600, color: C.tinta, margin: 0 }}>{titulo}</h3>
      {cifra != null && (
        <span style={{ fontFamily: MONO, fontSize: '11.5px', color: TONO[tonoCifra] }}>{cifra}</span>
      )}
      {accion && <div style={{ marginLeft: 'auto', display: 'flex', minWidth: 0, alignItems: 'center' }}>{accion}</div>}
    </div>
  )
}

/** El chevron de fin de fila. Es afordancia, no decoración: sólo donde la fila lleva a algún lado. */
export function Chevron() {
  return (
    <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, color: C.fantasma }}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

/** La barra fina del encabezado (Preparación) y de las métricas. 4px sobre `#EAE7E6`, radio 2, con
 *  el relleno en grafito — los valores del zip. La PISTA se dibuja siempre; el relleno, sólo con
 *  una fracción real: una pista vacía dice «no hay con qué llenarla», un relleno en 0 diría «no
 *  avanzó nada», que es la afirmación contraria. */
export function BarraFina({ pct, tono = C.grafito, className = '' }: {
  pct: number | null
  /** El color del relleno. Grafito por defecto: el avance no es un estado —estar al 40 % no es
   *  bueno ni malo—, así que se pinta con la estructura y no con semántica. */
  tono?: string
  className?: string
}) {
  return (
    <span className={className} style={{
      display: 'block', height: '4px', background: C.barraCanal, borderRadius: '2px', overflow: 'hidden',
    }}>
      {pct != null && (
        <span style={{ display: 'block', height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`, background: tono }} />
      )}
    </span>
  )
}

// ═══ LAS PIEZAS DEL RESUMEN «ERP Obras» (03 · Z01 · M04 · MZ1), medidas en los .html del diseño ═══
//
// El Resumen nuevo NO enmarca sus bloques: título de 14/600, eyebrow mono en el aside, filas con
// hairline. Las piezas de arriba (`Tarjeta`, `CabeceraTarjeta`) siguen exportadas porque las usan
// FichaObra, ChecklistPreparacion, CurvaAvance y OrdenesDeLaObra.

export const TONO_TEXTO = {
  ink: C.tinta, warn: C.warn, neg: C.neg, pos: C.pos, faint: C.tenue,
} as const
export type TonoTexto = keyof typeof TONO_TEXTO

/** El eyebrow mono del diseño: 10,5px / .06em / uppercase / faint. */
export function Eyebrow({ children, derecha }: { children: ReactNode; derecha?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
      <div style={{
        fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase',
      }}>{children}</div>
      {derecha != null && <div style={{ fontSize: '12px', color: C.tintaSuave }}>{derecha}</div>}
    </div>
  )
}

/** «Avance · 86% · 31 de 42 ítems medidos»: 28px en escritorio (03/Z01), 24px en 390 (M04/MZ1). */
export function CifraGrande({ rotulo, valor, falta, bajada, tono = 'ink', tam = 28, testid }: {
  rotulo: string
  valor: ReactNode | null
  /** La palabra de la ausencia. NUNCA un cero. */
  falta?: string
  bajada?: string
  tono?: TonoTexto
  tam?: 28 | 24
  testid?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tam === 28 ? '5px' : '3px' }} data-testid={testid}>
      <div style={{
        fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase',
      }}>{rotulo}</div>
      {valor == null || valor === ''
        ? <div style={{ fontSize: tam === 28 ? '15px' : '14px', color: C.tenue, fontStyle: 'italic', lineHeight: tam === 28 ? '34px' : '29px' }} data-nulo="">{falta ?? 'sin dato'}</div>
        : <div style={{
          fontSize: `${tam}px`, fontWeight: 600, letterSpacing: '-.02em', color: TONO_TEXTO[tono],
          fontVariantNumeric: 'tabular-nums', lineHeight: 1.2,
        }}>{valor}</div>}
      {bajada && <div style={{ fontSize: tam === 28 ? '12.5px' : '12px', color: C.tintaSuave }}>{bajada}</div>}
    </div>
  )
}

/** El título de un bloque del cuerpo (03 «Lo que frena la obra hoy»): 14/600 y su meta al lado. */
export function TituloBloque({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
      <div style={{ fontSize: '14px', fontWeight: 600, color: C.tinta }}>{children}</div>
      {meta != null && <div style={{ fontSize: '12.5px', color: C.tintaSuave }}>{meta}</div>}
    </div>
  )
}

/** Una fila clave · valor del aside (13,5px, `space-between`, gap 16). */
export function FilaKV({ k, v, tono = 'ink', tam = 13.5, testid }: {
  k: ReactNode
  v: ReactNode | null
  tono?: TonoTexto
  tam?: 13.5 | 12.5
  testid?: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', fontSize: '13.5px' }} data-testid={testid}>
      <span style={{ color: C.tintaSuave }}>{k}</span>
      <span style={{ color: TONO_TEXTO[tono], fontSize: `${tam}px`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
  )
}

/** Lo que falta se escribe en faint e itálica, nunca como un cero ni un guión. */
export function SinDato({ children }: { children: ReactNode }) {
  return <span style={{ color: C.tenue, fontStyle: 'italic' }} data-nulo="">{children}</span>
}

/** Un bloque del aside: eyebrow + cuerpo, `gap:11px`. */
export function BloqueAside({ titulo, children, testid, derecha }: {
  titulo: string; children: ReactNode; testid?: string; derecha?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }} data-testid={testid}>
      <Eyebrow derecha={derecha}>{titulo}</Eyebrow>
      {children}
    </div>
  )
}

/** Un bloque del teléfono (M04): eyebrow con conteo a la derecha + filas, `gap:6px`. */
export function BloqueTelefono({ titulo, derecha, children, testid }: {
  titulo: string; derecha?: ReactNode; children: ReactNode; testid?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }} data-testid={testid}>
      <Eyebrow derecha={derecha}>{titulo}</Eyebrow>
      {children}
    </div>
  )
}
