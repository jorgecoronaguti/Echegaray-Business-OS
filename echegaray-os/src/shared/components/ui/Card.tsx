import type { ReactNode } from 'react'

// CARD — la superficie base del sistema visual del OS: fondo blanco, hairline frost,
// radio contenido y sombra azulada muy sutil. Reemplaza el patrón repetido
// `rounded-xl border border-slate-200 bg-white shadow-sm`. Reutilizable por todo el OS.
type Padding = 'none' | 'sm' | 'md' | 'lg'
const PAD: Record<Padding, string> = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5' }

export function Card({
  children,
  padding = 'lg',
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode
  padding?: Padding
  className?: string
  as?: 'div' | 'section' | 'aside' | 'li'
}) {
  return (
    <Tag className={`rounded-card border border-line bg-surface shadow-card ${PAD[padding]} ${className}`}>
      {children}
    </Tag>
  )
}

// SECTIONHEADER — encabezado consistente: eyebrow (opcional), título, subtítulo y un
// slot a la derecha (acciones/estado). Un solo peso tipográfico por nivel de jerarquía.
export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  right,
  className = '',
}: {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        {eyebrow && <div className="text-[11px] font-medium uppercase tracking-wide text-faint">{eyebrow}</div>}
        <h2 className="mt-0.5 text-[15px] font-semibold leading-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-1 text-[13px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

// EYEBROW — la etiqueta pequeña en mayúsculas que rotula un bloque. Un único estilo.
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`text-[11px] font-medium uppercase tracking-wide text-faint ${className}`}>{children}</div>
}
