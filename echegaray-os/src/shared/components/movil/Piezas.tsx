import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { C, R, ALTO_BARRA } from './tokens'
import { Icono, type NombreIcono } from './Iconos'

// LAS PIEZAS DEL TELÉFONO, PORTADAS DEL `.dc.html` — no una capa sobre el Design System.
//
// Cada componente de acá reproduce un bloque que se repite idéntico en los quince mockups de
// `/home/jorge/echegaray-design/`: el topbar de 44px, la pastilla de filtro, la tarjeta blanca de
// radio 14, la barra de avance de 7px sobre pista `#EAE7E6`, el pie fijo de 52px.
//
// Se escriben con `style={{…}}` y no con clases porque el mockup ya viene como objeto de estilo
// (`style="fontSize:13.5px;color:#6B6B67"`) y traducirlo a la escala de Tailwind es exactamente el
// paso que produjo «estructura parecida, aspecto distinto» en las cuatro entregas rechazadas.
//
// SÓLO el `:hover` va por clase, porque un pseudo-estado no existe como estilo en línea.

export const SANS = "var(--font-plex-sans), 'IBM Plex Sans', system-ui, sans-serif"
export const MONO = "var(--font-plex-mono), 'IBM Plex Mono', ui-monospace, monospace"

/** El texto monoespaciado del mockup: todo número que se compara de una columna a otra. */
export const mono: CSSProperties = { fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }

/**
 * EL MARCO DE UNA PANTALLA DEL TELÉFONO.
 *
 * El mockup dibuja un teléfono de 390px sobre un fondo gris. En producción el teléfono ES el
 * viewport, así que lo que viaja es el ANCHO MÁXIMO: hasta 430px la pantalla ocupa todo, y en la
 * notebook del dueño (1280) queda la misma columna centrada sobre el canvas. Estirarla a 1280 sería
 * el «desktop reducido» que el contrato de estos dos perfiles prohíbe.
 */
export function MarcoMovil({ children, conBarra }: { children: ReactNode; conBarra?: boolean }) {
  return (
    <div
      data-testid="marco-movil"
      style={{
        minHeight: '100vh',
        margin: '0 auto',
        maxWidth: 430,
        background: C.canvas,
        paddingBottom: conBarra ? ALTO_BARRA : 0,
        fontFamily: SANS,
      }}
    >
      {children}
    </div>
  )
}

/**
 * EL TOPBAR DE MARCA — J01 y M02.
 *
 * `padding:12px 16px`, isotipo de 26, el nombre de la empresa en 10,5/600 con `letterSpacing:.04em`
 * y debajo el contexto (la obra). El círculo de iniciales es 34px en grafito, nunca amarillo.
 */
export function TopBarMarca({
  contexto, iniciales, testid = 'topbar-marca',
}: {
  /** El renglón de abajo: la obra. Puede traer su propio `▾` cuando se puede cambiar. */
  contexto: ReactNode
  iniciales: string
  testid?: string
}) {
  return (
    <div
      data-testid={testid}
      style={{
        background: C.surface, padding: '12px 16px', borderBottom: `1px solid ${C.linea}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/marca/isotipo.png" alt="" style={{ width: 26, height: 26, objectFit: 'contain' }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: C.ink, letterSpacing: '.04em' }}>
          ECHEGARAY CONSTRUCCIONES
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: C.muted }}>
          {contexto}
        </div>
      </div>
      <div
        data-testid="iniciales"
        style={{
          width: 34, height: 34, borderRadius: 17, background: C.grafito, color: C.surface,
          fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {iniciales}
      </div>
    </div>
  )
}

/**
 * EL TOPBAR DE UNA PANTALLA DE DETALLE — J02…J06, M03…M08.
 *
 * `padding:10px 12px`, objetivo de 44×44 para la flecha, título 14/600 y bajada 11,5 en `muted`. La
 * flecha lleva a un destino DECLARADO y no a `history.back()`: después de guardar y volver, la pila
 * tiene la misma pantalla dos veces y el gesto deja al jefe girando en el lugar.
 */
export function TopBarDetalle({
  volver, titulo, sub, accion, extra, testid = 'topbar-detalle', testidVolver = 'volver',
}: {
  volver?: { href: string; label: string }
  /** El `data-testid` de la flecha. El perfil jefe usa `volver-jefe` desde antes del rediseño. */
  testidVolver?: string
  titulo: ReactNode
  sub?: ReactNode
  /** El objetivo de 44 de la derecha: buscar, historial, «más». */
  accion?: ReactNode
  /** Lo que cuelga DEBAJO del renglón: el campo de búsqueda de J02, los filtros de M03. */
  extra?: ReactNode
  testid?: string
}) {
  return (
    <div
      data-testid={testid}
      style={{ background: C.surface, borderBottom: `1px solid ${C.linea}`, padding: '10px 12px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {volver && (
          <Link
            href={volver.href}
            data-testid={testidVolver}
            aria-label={`Volver a ${volver.label}`}
            className="hover:bg-[#F2F1ED]"
            style={{
              width: 44, height: 44, borderRadius: 22, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: C.ink, flexShrink: 0,
            }}
          >
            <Icono nombre="volver" tamano={22} />
          </Link>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 14, fontWeight: 600, color: C.ink,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {titulo}
          </div>
          {sub != null && <div style={{ fontSize: 11.5, color: C.muted }}>{sub}</div>}
        </div>
        {accion}
      </div>
      {extra}
    </div>
  )
}

/** El objetivo circular de 44 del topbar: buscar, historial, «más». */
export function BotonTopBar({
  children, href, titulo, color = C.muted, testid,
}: {
  children: ReactNode
  href?: string
  titulo: string
  color?: string
  testid?: string
}) {
  const estilo: CSSProperties = {
    width: 44, height: 44, borderRadius: 22, display: 'flex', alignItems: 'center',
    justifyContent: 'center', color, flexShrink: 0,
  }
  return href ? (
    <Link href={href} title={titulo} aria-label={titulo} data-testid={testid} className="hover:bg-[#F2F1ED]" style={estilo}>
      {children}
    </Link>
  ) : (
    <span title={titulo} data-testid={testid} style={estilo}>{children}</span>
  )
}

/** La franja blanca de pastillas que va bajo el topbar: `padding:8px 12px`, desliza de costado. */
export function FranjaFiltros({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <div
      data-testid={testid}
      style={{
        background: C.surface, borderBottom: `1px solid ${C.linea}`, display: 'flex',
        alignItems: 'center', gap: 8, padding: '8px 12px', overflowX: 'auto',
      }}
    >
      {children}
    </div>
  )
}

/**
 * UNA PASTILLA DE FILTRO CON SU CUENTA.
 *
 * La elegida es GRAFITO con texto blanco, nunca amarilla: el amarillo de la marca ya es el botón
 * que ESCRIBE, y usarlo también para «qué estoy mirando» deja dos amarillos con significados
 * distintos en la misma pantalla. Es la regla que dibujan J02, J04, J05, M03 y M08.
 *
 * El objetivo táctil es la pastilla entera (`minHeight:36px` del mockup dentro de un enlace que
 * llega a 44 por el `padding` de la franja).
 */
export function Pastilla({
  href, texto, cuenta, activa, testid,
}: {
  href: string
  texto: string
  cuenta?: number | null
  activa: boolean
  testid?: string
}) {
  return (
    <Link
      href={href}
      data-testid={testid}
      aria-current={activa ? 'true' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5,
        border: `1px solid ${activa ? C.grafito : C.linea}`,
        background: activa ? C.grafito : C.surface,
        color: activa ? C.surface : C.inkSuave,
        borderRadius: R.pastilla, padding: '7px 12px', whiteSpace: 'nowrap', minHeight: 36,
      }}
    >
      {texto}
      {cuenta != null && (
        <span style={{ ...mono, fontSize: 11, color: activa ? C.grafitoTenue : C.faint }}>{cuenta}</span>
      )}
    </Link>
  )
}

/** La tarjeta blanca de radio 14 sobre el canvas. El borde cambia con el estado (parado, elegida). */
export function Tarjeta({
  children, borde = C.linea, fondo = C.surface, relleno = 14, grosorBorde = 1, testid, style,
}: {
  children: ReactNode
  borde?: string
  fondo?: string
  relleno?: number | string
  grosorBorde?: number
  testid?: string
  style?: CSSProperties
}) {
  return (
    <div
      data-testid={testid}
      style={{
        background: fondo, border: `${grosorBorde}px solid ${borde}`, borderRadius: R.tarjeta,
        padding: relleno, ...style,
      }}
    >
      {children}
    </div>
  )
}

/** La tarjeta que CONTIENE una lista: sin relleno propio, con `overflow:hidden` para el radio. */
export function TarjetaLista({ children, borde = C.linea, testid }: {
  children: ReactNode
  borde?: string
  testid?: string
}) {
  return (
    <div
      data-testid={testid}
      style={{
        background: C.surface, border: `1px solid ${borde}`, borderRadius: R.tarjeta, overflow: 'hidden',
      }}
    >
      {children}
    </div>
  )
}

/**
 * UNO DE LOS TRES AZULEJOS DE CIFRA — J01, J03, J06, M06.
 *
 * Icono 15–16px + rótulo en versalitas de 10,5 `faint`, la cifra en mono 18–21/600 y el detalle en
 * 11 `muted`. El valor `null` se escribe «—» y NUNCA cero: cero afirma que el dato existe y vale
 * cero, que es otra cosa.
 */
export function Azulejo({
  icono, rotulo, valor, detalle, colorValor = C.ink, colorIcono = C.muted, borde = C.linea,
  tamanoValor = 21, testid,
}: {
  icono: NombreIcono
  rotulo: string
  valor: ReactNode
  detalle?: ReactNode
  colorValor?: string
  colorIcono?: string
  borde?: string
  tamanoValor?: number
  testid?: string
}) {
  return (
    <div
      data-testid={testid}
      style={{
        flex: 1, background: C.surface, border: `1px solid ${borde}`, borderRadius: R.tarjeta,
        padding: '13px 12px', minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ display: 'flex', color: colorIcono, flexShrink: 0 }}>
          <Icono nombre={icono} tamano={16} />
        </span>
        <span
          style={{
            fontSize: 10.5, color: C.faint, letterSpacing: '.03em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {rotulo}
        </span>
      </div>
      <div style={{ ...mono, fontSize: tamanoValor, fontWeight: 600, color: colorValor, marginTop: 5, whiteSpace: 'nowrap' }}>
        {valor}
      </div>
      {detalle != null && (
        <div style={{ fontSize: 11, color: C.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {detalle}
        </div>
      )}
    </div>
  )
}

/** El título de sección: icono 17px `muted`, palabra en 15/600 y el conteo en mono a la derecha. */
export function RotuloSeccion({
  icono, children, extra, colorExtra = C.muted, margenArriba = 22,
}: {
  icono: NombreIcono
  children: ReactNode
  extra?: ReactNode
  colorExtra?: string
  margenArriba?: number
}) {
  return (
    <div style={{ marginTop: margenArriba, display: 'flex', alignItems: 'center', gap: 9 }}>
      <span style={{ display: 'flex', color: C.muted }}><Icono nombre={icono} tamano={17} /></span>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{children}</div>
      {extra != null && (
        <span style={{ ...mono, marginLeft: 'auto', fontSize: 12.5, color: colorExtra }}>{extra}</span>
      )}
    </div>
  )
}

/**
 * LA BARRA DE AVANCE. `pct === null` dibuja la PISTA SOLA.
 *
 * Una barra en cero afirma que el trabajo no arrancó; `null` dice que nadie lo midió. Son dos
 * afirmaciones distintas y en los mockups se ven distintas: la sin medir queda vacía y su número
 * dice «—».
 */
export function BarraAvance({
  pct, color = C.info, alto = 7, testid = 'barra-avance',
}: {
  pct: number | null
  color?: string
  alto?: number
  testid?: string
}) {
  return (
    <div
      data-testid={testid}
      data-pct={pct ?? ''}
      style={{ height: alto, background: C.pista, borderRadius: alto / 2 + 0.5, overflow: 'hidden' }}
    >
      {pct != null && (
        <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
      )}
    </div>
  )
}

/** El pie fijo blanco de las pantallas de acción: `padding:12px 16px 16px` y borde arriba. */
export function PieFijo({ children, testid = 'pie-fijo', sobreBarra }: {
  children: ReactNode
  testid?: string
  sobreBarra?: boolean
}) {
  return (
    <div
      data-testid={testid}
      style={{
        position: 'fixed', bottom: sobreBarra ? ALTO_BARRA : 0, left: 0, right: 0,
        margin: '0 auto', maxWidth: 430, background: C.surface, borderTop: `1px solid ${C.linea}`,
        padding: '12px 16px 16px', zIndex: 20,
      }}
    >
      {children}
    </div>
  )
}

/**
 * LA PRIMARIA DE 52px. Amarilla cuando hay algo que guardar, inerte cuando no — y el TEXTO dice qué
 * falta: «Marcá el paso alcanzado» en vez de «Guardar» en gris, que se lee como un sistema roto.
 */
export function BotonAncho({
  children, activo = true, tipo = 'submit', icono, alto = 52, testid, onClick,
}: {
  children: ReactNode
  activo?: boolean
  tipo?: 'submit' | 'button'
  icono?: NombreIcono
  alto?: number
  testid?: string
  onClick?: () => void
}) {
  return (
    <button
      type={tipo}
      disabled={!activo}
      data-testid={testid}
      onClick={onClick}
      style={{
        width: '100%', minHeight: alto, borderRadius: R.control,
        background: activo ? C.marca : C.inerte, color: activo ? C.ink : C.faint,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
        fontSize: 16, fontWeight: 600, border: 'none', cursor: activo ? 'pointer' : 'not-allowed',
        fontFamily: SANS,
      }}
    >
      {icono && <Icono nombre={icono} tamano={20} grosor={2.4} />}
      {children}
    </button>
  )
}

/** La barra de contextos del pie — J01, M02, M09. `padding:6px 4px 10px`, activo en `#FEF9E6`. */
export function BarraContextos({
  items, testid = 'barra-contextos',
}: {
  items: { href: string; label: string; icono: NombreIcono; activo: boolean; testid?: string }[]
  testid?: string
}) {
  return (
    <nav
      data-testid={testid}
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, margin: '0 auto', maxWidth: 430,
        background: C.surface, borderTop: `1px solid ${C.linea}`, display: 'flex',
        alignItems: 'stretch', padding: '6px 4px 10px', zIndex: 20,
      }}
    >
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          data-testid={n.testid}
          aria-current={n.activo ? 'page' : undefined}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '7px 0', minHeight: 48, justifyContent: 'center', borderRadius: R.controlChico,
            background: n.activo ? C.marcaSuave : 'transparent',
            color: n.activo ? C.ink : C.faint,
          }}
        >
          <Icono nombre={n.icono} tamano={21} />
          <span style={{ fontSize: 10.5, fontWeight: n.activo ? 600 : 400 }}>{n.label}</span>
        </Link>
      ))}
    </nav>
  )
}

/** El vacío que EXPLICA. Nunca «no hay datos»: qué falta y quién lo carga. */
export function Vacio({ children, testid = 'vacio' }: { children: ReactNode; testid?: string }) {
  return (
    <div data-testid={testid} style={{ padding: '22px 4px', fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
      {children}
    </div>
  )
}

/** El aviso de error de lectura. Se ve como el bloque «parado» del mockup: es la misma gravedad. */
export function AvisoError({ children, testid = 'aviso-error' }: { children: ReactNode; testid?: string }) {
  return (
    <div
      data-testid={testid}
      style={{
        background: C.negFondo, border: `1px solid ${C.negBorde}`, borderRadius: R.tarjeta,
        padding: 14, display: 'flex', alignItems: 'flex-start', gap: 11, marginBottom: 12,
      }}
    >
      <span style={{ display: 'flex', color: C.neg, flexShrink: 0, marginTop: 1 }}>
        <Icono nombre="bloqueo" tamano={20} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>No se pudo leer todo</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 1 }}>{children}</div>
      </div>
    </div>
  )
}
