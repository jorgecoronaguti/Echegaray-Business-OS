// LAS PIEZAS QUE TODAS LAS VISTAS COMPARTEN: el título con su línea de datos, la fila de cifras, la
// ausencia dicha con su palabra y el anillo.
//
// Sin cards y sin sombras (dueño, 17/09/2026): una cifra es un rótulo chico arriba y un número
// tabular abajo, separada de la siguiente por aire y un filo. Los rótulos de los gráficos van en
// HTML superpuesto, no en `<text>` de SVG: el SVG escala con el ancho y la tipografía no debe.
import type { ReactNode } from 'react'

export function Titulo({ titulo, linea }: { titulo: string; linea: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-lg font-semibold text-ink">{titulo}</h1>
      <p className="mt-1 text-sm text-muted tabular-nums">{linea}</p>
    </div>
  )
}

/** Una ausencia: su palabra, en tenue. Nunca `$ 0`. */
export function Ausente({ children }: { children: ReactNode }) {
  return <span className="font-normal text-faint">{children}</span>
}

/** El valor o la palabra que dice por qué no hay. */
export function Valor({ v, falta }: { v: string | null; falta: string }) {
  return v == null ? <Ausente>{falta}</Ausente> : <>{v}</>
}

export interface Cifra { rotulo: string; valor: string | null; falta?: string; tono?: 'neg' | 'warn' | 'pos' }

const TONO = { neg: 'text-neg', warn: 'text-warn', pos: 'text-pos' } as const

export function Cifras({ cifras }: { cifras: Cifra[] }) {
  return (
    <dl className="mb-8 grid grid-cols-2 border-y border-line sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none">
      {cifras.map((c) => (
        <div key={c.rotulo} className="border-line px-0 py-4 pr-4 odd:border-r sm:border-r lg:border-r lg:px-4 lg:first:pl-0 lg:last:border-r-0">
          <dt className="text-xs text-faint">{c.rotulo}</dt>
          <dd className={`mt-1 text-xl font-semibold tabular-nums ${c.tono ? TONO[c.tono] : 'text-ink'}`}>
            <Valor v={c.valor} falta={c.falta ?? 'sin registrar'} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function Subtitulo({ children, derecha }: { children: ReactNode; derecha?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-baseline justify-between gap-4 border-b border-line pb-2">
      <h2 className="text-sm font-semibold text-ink">{children}</h2>
      {derecha ? <span className="text-xs text-faint tabular-nums">{derecha}</span> : null}
    </div>
  )
}

const R = 26
const LARGO = 2 * Math.PI * R

/**
 * EL ANILLO: se llena con la proporción (tope visual 100 %, el excedido se dice en rojo). `null` =
 * anillo vacío gris y «—» al centro: sin presupuesto no hay nada que llenar.
 */
export function Anillo({ proporcion, tono = 'dato', centro, tamano = 88 }: {
  proporcion: number | null
  tono?: 'dato' | 'neg' | 'warn' | 'pos'
  centro: ReactNode
  tamano?: number
}) {
  const lleno = proporcion == null ? 0 : Math.max(0, Math.min(1, proporcion))
  const trazo = { dato: 'stroke-accent', neg: 'stroke-neg', warn: 'stroke-warn', pos: 'stroke-pos' }[tono]
  return (
    <div className="relative shrink-0" style={{ width: tamano, height: tamano }}>
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" className="stroke-line" />
        {proporcion != null && lleno > 0 ? (
          <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" className={trazo}
            strokeDasharray={`${LARGO * lleno} ${LARGO}`} strokeLinecap="butt" />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-base font-semibold tabular-nums text-ink">
        {centro}
      </div>
    </div>
  )
}

/** Sin datos legibles: la base no contestó para este rol, o la lectura falló. Se dice, no se dibuja en cero. */
export function SinLectura({ que }: { que: string }) {
  return <p className="border-y border-line py-6 text-sm text-muted">No se pudo leer {que}.</p>
}
