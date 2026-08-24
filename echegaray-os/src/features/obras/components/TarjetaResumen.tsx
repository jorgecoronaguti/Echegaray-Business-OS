// LA TARJETA DEL RESUMEN — el contenedor que el canónico 02 usa para TODOS sus bloques.
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

export function Tarjeta({ children, testid, className = '' }: {
  children: React.ReactNode
  testid?: string
  className?: string
}) {
  return (
    <section
      data-testid={testid}
      className={`overflow-hidden rounded-card border border-line bg-surface ${className}`}
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
  const TONO = { muted: 'text-muted', warn: 'text-warn', neg: 'text-neg', pos: 'text-pos' } as const
  return (
    <div className="flex items-center gap-2.5 border-b border-surface-sunken px-4 py-[11px]">
      {icono && <span className="flex shrink-0 text-muted">{icono}</span>}
      <h3 className="text-[13px] font-semibold text-ink">{titulo}</h3>
      {cifra != null && (
        <span className={`font-mono text-[11.5px] tabular-nums ${TONO[tonoCifra]}`}>{cifra}</span>
      )}
      {accion && <div className="ml-auto flex min-w-0 items-center">{accion}</div>}
    </div>
  )
}

/** El chevron de fin de fila. Es afordancia, no decoración: sólo donde la fila lleva a algún lado. */
export function Chevron() {
  return (
    <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" className="shrink-0 text-line-strong">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

/** La barra fina del encabezado (Preparación) y de las métricas. La PISTA se dibuja siempre; el
 *  relleno, sólo con una fracción real — una pista vacía dice «no hay con qué llenarla». */
export function BarraFina({ pct, tono = 'bg-accent', className = '' }: {
  pct: number | null
  tono?: string
  className?: string
}) {
  return (
    <span className={`block h-1 overflow-hidden rounded-full bg-surface-sunken ${className}`}>
      {pct != null && (
        <span className={`block h-full ${tono}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      )}
    </span>
  )
}
