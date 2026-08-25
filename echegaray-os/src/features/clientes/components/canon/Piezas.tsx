'use client'

// LAS PIEZAS QUE LAS TRES PANTALLAS (28 · 31 · 32) REPITEN, con sus medidas del `.dc.html`.
//
// Son de cliente porque el zip dibuja `style-hover` en casi todos los controles y ese estado no
// existe del lado del servidor. Nada de acá decide nada: son formas.

import { useState, type CSSProperties, type ReactNode } from 'react'
import { C, MONO, botonIcono } from './tokens'
import { Ico, P } from './Iconos'

/** El `style-hover` del zip, resuelto con estado local. Devuelve los dos manejadores y el flag. */
export function useHover() {
  const [hover, setHover] = useState(false)
  return {
    hover,
    props: { onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false) },
  }
}

/** El cuadrado con un ícono adentro: 31px en la cabecera, 30px en una fila, 29px en el plan. */
export function BotonIcono({
  titulo, onClick, children, lado = 31, tono = 'neutro', testid, deshabilitado = false,
}: {
  titulo: string
  onClick?: () => void
  children: ReactNode
  lado?: 29 | 30 | 31
  /** `alerta` es el botón de escalar (`28:600`): borde cálido y color de aviso. */
  tono?: 'neutro' | 'alerta'
  testid?: string
  deshabilitado?: boolean
}) {
  const { hover, props } = useHover()
  const base = botonIcono(lado)
  return (
    <button
      type="button" title={titulo} aria-label={titulo} onClick={onClick} disabled={deshabilitado}
      data-testid={testid} {...props}
      style={{
        ...base,
        border: `1px solid ${tono === 'alerta' ? C.warnBorde : hover ? C.bordeFuerte : C.borde}`,
        color: tono === 'alerta' ? C.warn : hover ? C.tinta : C.tintaSuave,
        background: tono === 'alerta' && hover ? C.warnFondo : C.superficie,
        opacity: deshabilitado ? 0.5 : 1,
        cursor: deshabilitado ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

/** El botón de texto con ícono: primaria amarilla, secundaria blanca o acción grafito del plan. */
export function Boton({
  children, onClick, estilo, hoverFondo, testid, type = 'button', deshabilitado = false,
}: {
  children: ReactNode
  onClick?: () => void
  estilo: CSSProperties
  hoverFondo: string
  testid?: string
  type?: 'button' | 'submit'
  deshabilitado?: boolean
}) {
  const { hover, props } = useHover()
  return (
    <button
      type={type} onClick={onClick} disabled={deshabilitado} data-testid={testid} {...props}
      style={{
        ...estilo,
        background: deshabilitado ? C.tenueFondo : hover ? hoverFondo : estilo.background,
        color: deshabilitado ? C.tenue : estilo.color,
        cursor: deshabilitado ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

export type Tono = 'pos' | 'curso' | 'warn' | 'neg' | 'neutro'

const TONO: Record<Tono, { c: string; f: string; b: string }> = {
  pos: { c: C.pos, f: C.posFondo, b: C.posBorde },
  curso: { c: C.curso, f: C.cursoFondo, b: '#D6E4FB' },
  warn: { c: C.warn, f: C.warnFondo, b: C.warnBorde },
  neg: { c: C.neg, f: C.negFondo, b: C.negBorde },
  neutro: { c: C.tintaSuave, f: C.tenueFondo, b: C.borde },
}

/** La pastilla de la cabecera: «$ 8,2 M vencido», «2 cambios sin publicar», «Portal activo». */
export function Pastilla({ tono, icono, children, testid }: {
  tono: Tono
  icono?: ReactNode
  children: ReactNode
  testid?: string
}) {
  const t = TONO[tono]
  return (
    <span
      data-testid={testid}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px',
        fontWeight: 500, color: t.c, background: t.f, border: `1px solid ${t.b}`,
        borderRadius: '12px', padding: '2px 10px', whiteSpace: 'nowrap',
      }}
    >
      {icono && <span style={{ display: 'flex' }}>{icono}</span>}
      {children}
    </span>
  )
}

/** El interruptor: 34×19 con perilla de 15 en una fila (`32:130`), 36×20 con 16 en las reglas
 *  del portal (`31:307`). Amarillo encendido, `#E7E6E2` apagado. */
export function Interruptor({ encendido, onClick, etiqueta, grande = false, testid }: {
  encendido: boolean
  onClick?: () => void
  etiqueta: string
  grande?: boolean
  testid?: string
}) {
  const ancho = grande ? 36 : 34
  const alto = grande ? 20 : 19
  const perilla = grande ? 16 : 15
  return (
    <button
      type="button" role="switch" aria-checked={encendido} aria-label={etiqueta} title={etiqueta}
      onClick={onClick} data-testid={testid}
      style={{
        width: `${ancho}px`, height: `${alto}px`, borderRadius: '10px', border: 'none',
        background: encendido ? C.marca : C.borde, display: 'flex', alignItems: 'center',
        padding: '2px', justifyContent: encendido ? 'flex-end' : 'flex-start', flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span style={{
        width: `${perilla}px`, height: `${perilla}px`, borderRadius: '8px', background: C.superficie,
      }} />
    </button>
  )
}

/** La casilla cuadrada de «QUÉ PUEDE HACER» (`31:260`): 20×20, radio 5, tilde grafito. */
export function Casilla({ marcada, onClick, etiqueta, testid }: {
  marcada: boolean
  onClick?: () => void
  etiqueta: string
  testid?: string
}) {
  return (
    <button
      type="button" role="checkbox" aria-checked={marcada} aria-label={etiqueta} onClick={onClick}
      data-testid={testid}
      style={{
        width: '20px', height: '20px', borderRadius: '5px', flexShrink: 0, padding: 0,
        background: marcada ? C.marca : C.superficie,
        border: marcada ? 'none' : `1px solid ${C.bordeFuerte}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        color: C.tinta,
      }}
    >
      {marcada && <Ico d={P.ok} s={13} w={3} />}
    </button>
  )
}

/** El chip elegible: medio de pago (`32:445`), alcance de obras (`31:293`). */
export function Chip({ activo, onClick, children, testid }: {
  activo: boolean
  onClick?: () => void
  children: ReactNode
  testid?: string
}) {
  const { hover, props } = useHover()
  return (
    <button
      type="button" onClick={onClick} data-testid={testid} aria-pressed={activo} {...props}
      style={{
        fontSize: '12px', fontWeight: activo ? 500 : 400,
        color: activo ? C.tinta : hover ? C.tinta : C.tintaSuave,
        background: activo ? C.marcaSuave : C.superficie,
        border: `1px solid ${activo ? C.marcaBorde : hover ? C.bordeFuerte : C.borde}`,
        borderRadius: '14px', padding: '5px 11px', cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}

/** El encabezado de un bloque suelto. `conFilo` es la variante con línea abajo (`28:368`). */
export function TituloBloque({ icono, titulo, derecha, conFilo = false, testid }: {
  icono: ReactNode
  titulo: string
  derecha?: ReactNode
  conFilo?: boolean
  testid?: string
}) {
  return (
    <div
      data-testid={testid}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        ...(conFilo
          ? { paddingBottom: '10px', borderBottom: `1px solid ${C.borde}` }
          : { marginBottom: '2px' }),
      }}
    >
      <span style={{ display: 'flex', color: C.tenue }}>{icono}</span>
      <div style={{ fontSize: '12.5px', fontWeight: 600, color: C.tinta }}>{titulo}</div>
      {derecha}
    </div>
  )
}

/** Un número en mono, que es como el zip escribe TODA cifra comparable. */
export function Mono({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={{ fontFamily: MONO, ...style }}>{children}</span>
}

/**
 * LO QUE SE ESCRIBE CUANDO NO HAY DATO.
 *
 * No es un cartel de error ni un bloque vacío: es una línea que dice qué falta y por qué, en el
 * mismo lugar donde iría el dato. Un bloque que desaparece cuando no tiene filas hace creer que la
 * pantalla no tiene esa sección.
 */
export function Vacio({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <div
      data-testid={testid}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 0',
        fontSize: '11.5px', color: C.tenue, lineHeight: 1.5,
      }}
    >
      <span style={{ display: 'flex', color: C.fantasma }}><Ico d={P.info} s={14} /></span>
      {children}
    </div>
  )
}
