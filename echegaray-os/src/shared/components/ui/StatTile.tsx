import type { ReactNode } from 'react'

// STATTILE — la celda de métrica del sistema visual: etiqueta chica arriba, valor
// tabular grande, pista opcional. Densidad alta sin ruido. El tono tiñe sólo el valor
// (estado), nunca el fondo. Reutilizable por todo el OS.
type Tono = 'ink' | 'pos' | 'neg' | 'warn'
const VAL: Record<Tono, string> = {
  ink: 'text-ink',
  pos: 'text-pos',
  neg: 'text-neg',
  warn: 'text-warn',
}
type Tamano = 'sm' | 'md' | 'lg'
const SIZE: Record<Tamano, string> = {
  sm: 'text-[15px]',
  md: 'text-lg',
  lg: 'text-2xl',
}

export function StatTile({
  label,
  value,
  hint,
  tono = 'ink',
  size = 'md',
  onDark = false,
  className = '',
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  tono?: Tono
  size?: Tamano
  onDark?: boolean
  className?: string
}) {
  return (
    <div className={`rounded-control ${onDark ? 'bg-white/[0.06] px-3 py-2' : 'bg-surface-quiet px-3 py-2.5'} ${className}`}>
      <div className={`text-[10px] font-medium uppercase tracking-wide ${onDark ? 'text-white/55' : 'text-faint'}`}>
        {label}
      </div>
      <div className={`mt-0.5 font-semibold tabular-nums ${SIZE[size]} ${onDark ? 'text-white' : VAL[tono]}`}>
        {value}
      </div>
      {hint && <div className={`mt-0.5 text-[11px] ${onDark ? 'text-white/45' : 'text-faint'}`}>{hint}</div>}
    </div>
  )
}

// KeyValue — fila etiqueta ↔ valor con hairline inferior. El patrón denso de "Dato".
export function KeyValue({
  k,
  v,
  tono = 'ink',
  strong = false,
}: {
  k: ReactNode
  v: ReactNode
  tono?: Tono
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-0">
      <span className="text-[13px] text-muted">{k}</span>
      <span className={`text-[13px] tabular-nums ${strong ? 'font-semibold' : 'font-medium'} ${VAL[tono]}`}>{v}</span>
    </div>
  )
}
