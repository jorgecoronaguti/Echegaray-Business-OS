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
