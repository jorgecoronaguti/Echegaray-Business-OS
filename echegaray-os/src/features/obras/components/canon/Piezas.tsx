'use client'

// LAS CUATRO PIEZAS QUE EL ZIP REPITE EN LAS SEIS PANTALLAS.
//
// No es un design system nuevo: es lo que ya estaba repetido literal en los `.dc.html` —la pastilla
// de estado, el chip de filtro con su número, la barra de progreso y la tarjeta blanca—. Escribirlas
// una vez evita que la pastilla del 01 y la del 03 se separen dos píxeles la próxima vez que alguien
// toque una sola de las dos; medirlas de nuevo se hace abriendo el mockup, no este archivo.
//
// EL HOVER DEL ZIP (`style-hover="background:#FAFAF8"`) NO EXISTE EN CSS INLINE: se implementa con
// estado local. Es la única traducción que el porte se permite, y está acá para hacerla una vez.

import { useState, type CSSProperties, type ReactNode } from 'react'
import { C, MONO, PASTILLA, type TonoPastilla } from './tokens'
import { Ico, P } from './Ico'

/** Una fila u opción que se ilumina al pasar el mouse, como el `style-hover` del zip. */
export function Hover({ base, hover, children, ...resto }: {
  base: CSSProperties
  /** Lo que el zip pone en `style-hover`. */
  hover: CSSProperties
  children: ReactNode
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'style' | 'children'>) {
  const [on, setOn] = useState(false)
  return (
    <div {...resto} style={on ? { ...base, ...hover } : base}
      onMouseEnter={() => setOn(true)} onMouseLeave={() => setOn(false)}>
      {children}
    </div>
  )
}

/**
 * LA PASTILLA DE ESTADO — 11px/500, radio 11, padding 1.5px 8px (01, 02, 03, 04).
 *
 * Los tres colores viajan juntos porque en el zip viajan juntos: texto, fondo y borde de la misma
 * familia. Una pastilla con el texto de un tono y el borde de otro no existe en ningún mockup.
 */
export function Pastilla({ tono, children, radio = 11, tam = 11 }: {
  tono: TonoPastilla
  children: ReactNode
  /** 11 en tabla y panel; 12 en la cabecera de obra (mockup 02: `borderRadius:12px`). */
  radio?: number
  /** 11px en tabla y panel; 11,5px en la cabecera de obra. */
  tam?: number
}) {
  const c = PASTILLA[tono]
  return (
    <span style={{
      fontSize: `${tam}px`, fontWeight: 500, color: c.c, background: c.f,
      border: `1px solid ${c.b}`, borderRadius: `${radio}px`,
      padding: radio === 12 ? '2px 10px' : '1.5px 8px', whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

/**
 * EL CHIP DE FILTRO CON SU NÚMERO (01, 02, 03, 06).
 *
 * El número no es decorativo: sin él hay que tocar el chip para saber si hay algo del otro lado.
 * Activo = grafito lleno con el número en `#B9B7B1`; apagado = blanco con borde.
 */
export function Chip({ activo, onClick, titulo, icono, n, children }: {
  activo: boolean
  onClick: () => void
  titulo?: string
  /** El zip pone ícono en los chips del 01 y del 02, y no en los del 03 y 06. */
  icono?: ReactNode
  /** `null` = este filtro no cuenta nada (los del 05). */
  n?: string | null
  children: ReactNode
}) {
  return (
    <button type="button" onClick={onClick} title={titulo} aria-pressed={activo}
      data-activo={activo ? '1' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px',
        border: `1px solid ${activo ? C.grafito : C.borde}`,
        background: activo ? C.grafito : C.superficie,
        color: activo ? C.superficie : C.tintaMedia,
        borderRadius: '6px', padding: '4px 9px', cursor: 'pointer', font: 'inherit',
        fontFamily: 'inherit', lineHeight: 1.4,
      }}>
      {icono}
      {children}
      {n != null && (
        <span style={{ fontFamily: MONO, fontSize: '10.5px', color: activo ? C.apagado : C.tenue }}>{n}</span>
      )}
    </button>
  )
}

/** LA BARRA DE PROGRESO: canal `#EAE7E6`, alto 5px, radio 3 (01, 02, 03, 05). */
export function Barra({ pct, color, alto = 5, ancho }: {
  pct: number | null
  color: string
  alto?: number
  /** Sin ancho, ocupa lo que le den (`flex:1` del zip). */
  ancho?: string
}) {
  return (
    <span style={{
      display: 'block', width: ancho ?? '100%', height: `${alto}px`, background: C.barraCanal,
      borderRadius: `${Math.round(alto / 2) + 1}px`, overflow: 'hidden', flex: ancho ? undefined : 1,
    }}>
      <span style={{ display: 'block', height: '100%', width: `${Math.min(100, Math.max(0, pct ?? 0))}%`, background: color }} />
    </span>
  )
}

/** LA TARJETA BLANCA: `border:1px solid #E7E6E2; borderRadius:10px; overflow:hidden`. */
export function Tarjeta({ children, style, testid }: {
  children: ReactNode; style?: CSSProperties; testid?: string
}) {
  return (
    <div data-testid={testid} style={{
      background: C.superficie, border: `1px solid ${C.borde}`, borderRadius: '10px',
      overflow: 'hidden', ...style,
    }}>{children}</div>
  )
}

/** LA CABECERA DE UNA TARJETA: 11px 16px, divisor `#EFEEEA`, título 13px/600. */
export function TarjetaCabecera({ icono, titulo, meta, derecha }: {
  icono?: ReactNode; titulo: ReactNode; meta?: ReactNode; derecha?: ReactNode
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '9px', padding: '11px 16px',
      borderBottom: `1px solid ${C.bordeTarjeta}`,
    }}>
      {icono}
      <div style={{ fontSize: '13px', fontWeight: 600, color: C.tinta }}>{titulo}</div>
      {meta != null && <span style={{ fontFamily: MONO, fontSize: '11.5px', color: C.tintaSuave }}>{meta}</span>}
      {derecha != null && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>{derecha}</div>}
    </div>
  )
}

/**
 * EL BUSCADOR DEL ZIP — 246px en el 01, 222px en el 03, 208px en el 06.
 *
 * La ✕ aparece sólo con texto escrito, igual que el `sc-if` del mockup, y limpia de verdad: es la
 * misma función que resetea el filtro en las tres pantallas.
 */
export function Buscador({ valor, alCambiar, alLimpiar, placeholder, ancho, testid }: {
  valor: string
  alCambiar: (v: string) => void
  alLimpiar: () => void
  placeholder: string
  ancho: number
  testid?: string
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px', background: C.superficie,
      border: `1px solid ${C.borde}`, borderRadius: '6px', padding: '4px 8px', width: `${ancho}px`,
    }}>
      <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.buscar} s={13} /></span>
      <input type="text" placeholder={placeholder} value={valor} data-testid={testid}
        onChange={(e) => alCambiar(e.target.value)} aria-label={placeholder}
        style={{
          border: 'none', background: 'transparent', fontSize: '12px', color: C.tinta,
          width: '100%', padding: 0, outline: 'none', fontFamily: 'inherit',
        }} />
      {valor.length > 0 && (
        <button type="button" onClick={alLimpiar} title="Limpiar" aria-label="Limpiar la búsqueda"
          data-testid={testid ? `${testid}-limpiar` : undefined}
          style={{ display: 'flex', color: C.tenue, cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}>
          <Ico d={P.cerrar} s={13} />
        </button>
      )}
    </div>
  )
}

/** EL BOTÓN AMARILLO — la única primaria de cada pantalla del zip. */
export const ESTILO_PRIMARIA: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px', background: C.marca, color: C.tinta,
  fontSize: '12.5px', fontWeight: 600, borderRadius: '6px', padding: '6px 11px', cursor: 'pointer',
  border: 'none', fontFamily: 'inherit', lineHeight: 1.4, whiteSpace: 'nowrap',
}

/** EL BOTÓN SECUNDARIO — blanco con borde (03 «Rubro», 04 «Vincular actividad»). */
export const ESTILO_SECUNDARIA: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px', background: C.superficie,
  border: `1px solid ${C.borde}`, color: C.tintaMedia, fontSize: '12.5px', borderRadius: '6px',
  padding: '6px 11px', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.4, whiteSpace: 'nowrap',
}
