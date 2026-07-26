import type { ReactNode } from 'react'

// PAGESHELL — el marco de página del sistema visual del OS: canvas azulado a pantalla
// completa (la sensación de "planilla ordenada dentro de un marco cuidado") y un
// encabezado de página consistente (eyebrow · título · subtítulo · slot derecho).
// Reutilizable por todo el OS; hoy sólo lo adopta Ingeniería Financiera.
export function PageShell({
  eyebrow,
  title,
  subtitle,
  right,
  children,
  maxWidth = 'max-w-6xl',
}: {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  children: ReactNode
  maxWidth?: string
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <div className={`mx-auto ${maxWidth} px-5 py-7 sm:px-6`}>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            {eyebrow && <div className="text-[11px] font-medium uppercase tracking-wide text-faint">{eyebrow}</div>}
            <h1 className="mt-1 text-[22px] font-semibold leading-tight text-ink">{title}</h1>
            {subtitle && <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">{subtitle}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
        {children}
      </div>
    </div>
  )
}
