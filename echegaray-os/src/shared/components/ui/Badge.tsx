import type { ReactNode } from 'react'

// BADGE — chip de estado del sistema visual del OS. Radio contenido (no pill en
// superficies de acción, criterio Stripe), color semántico tenue. Un tono por
// significado; el color se reserva para estado, nunca decora. Reutilizable por todo el OS.
export type Tono = 'neutral' | 'pos' | 'neg' | 'warn' | 'info' | 'accent'

const TONO: Record<Tono, string> = {
  neutral: 'bg-surface-sunken text-ink-soft',
  pos: 'bg-pos-soft text-pos',
  neg: 'bg-neg-soft text-neg',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
  accent: 'bg-accent text-white',
}

export function Badge({
  children,
  tono = 'neutral',
  uppercase = false,
  className = '',
}: {
  children: ReactNode
  tono?: Tono
  uppercase?: boolean
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-control px-2 py-0.5 text-[11px] font-medium ${
        uppercase ? 'uppercase tracking-wide' : ''
      } ${TONO[tono]} ${className}`}
    >
      {children}
    </span>
  )
}

// Dot — punto de color semántico para acompañar un rótulo sin fondo de chip.
const DOT: Record<Tono, string> = {
  neutral: 'bg-faint',
  pos: 'bg-pos',
  neg: 'bg-neg',
  warn: 'bg-warn',
  info: 'bg-info',
  accent: 'bg-accent',
}

export function Dot({ tono = 'neutral', className = '' }: { tono?: Tono; className?: string }) {
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${DOT[tono]} ${className}`} />
}
