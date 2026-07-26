'use client'

// SEGMENTEDCONTROL — el conmutador de vistas del sistema visual del OS (p. ej.
// mensual / semanal / diaria). Pastilla contenida con la opción activa en tinta de
// acento. Un solo patrón reutilizable en vez de re-armar botones sueltos por pantalla.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  ariaLabel,
}: {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  ariaLabel?: string
}) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]'
  return (
    <div role="tablist" aria-label={ariaLabel} className="inline-flex gap-0.5 rounded-control border border-line bg-surface p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-[5px] font-medium transition ${pad} ${
              active ? 'bg-accent text-white shadow-card' : 'text-muted hover:bg-surface-sunken hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// StepNav — flechas anterior/siguiente consistentes (navegación de mes/semana).
export function StepNav({
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  prevDisabled,
  nextDisabled,
}: {
  onPrev: () => void
  onNext: () => void
  prevLabel: string
  nextLabel: string
  prevDisabled?: boolean
  nextDisabled?: boolean
}) {
  const base =
    'flex h-7 w-7 items-center justify-center rounded-control border border-line text-muted transition hover:bg-surface-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-30'
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label={prevLabel} title={prevLabel} onClick={onPrev} disabled={prevDisabled} className={base}>
        ‹
      </button>
      <button type="button" aria-label={nextLabel} title={nextLabel} onClick={onNext} disabled={nextDisabled} className={base}>
        ›
      </button>
    </div>
  )
}
