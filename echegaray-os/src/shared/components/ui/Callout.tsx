import type { ReactNode } from 'react'

// CALLOUT — el aviso inline del sistema visual (falta de dato, alerta, nota, éxito).
// Reemplaza los bloques ámbar/verde sueltos repetidos por toda la FE. Tono semántico
// tenue, hairline del mismo color. Reutilizable por todo el OS.
type Tono = 'warn' | 'info' | 'pos' | 'neg' | 'neutral'
const TONO: Record<Tono, string> = {
  warn: 'border-warn/30 bg-warn-soft text-warn',
  info: 'border-info/30 bg-info-soft text-info',
  pos: 'border-pos/30 bg-pos-soft text-pos',
  neg: 'border-neg/30 bg-neg-soft text-neg',
  neutral: 'border-line bg-surface-quiet text-muted',
}

export function Callout({
  children,
  tono = 'warn',
  className = '',
}: {
  children: ReactNode
  tono?: Tono
  className?: string
}) {
  return (
    <div className={`rounded-control border px-3 py-2 text-[13px] leading-relaxed ${TONO[tono]} ${className}`}>
      {children}
    </div>
  )
}
