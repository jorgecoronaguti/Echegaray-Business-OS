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
  testid,
}: {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  /** `control` lo pone a la altura de un input o un select (`--os-control-h`, 48 en el teléfono):
   *  es el tamaño que corresponde cuando el conmutador es UN CAMPO MÁS del formulario y no el
   *  selector de vista de un encabezado. */
  size?: 'sm' | 'md' | 'control'
  ariaLabel?: string
  /** Cada opción sale como `${testid}-${value}`. Sin esto un conmutador no se puede tocar desde un
   *  test sin depender del texto visible, que es lo primero que cambia. */
  testid?: string
}) {
  const control = size === 'control'
  const pad = control
    ? 'flex-1 min-h-control max-lg:min-h-control-movil px-3 text-[13px]'
    : size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]'
  // Botones simples (no role=tab): quedan descubribles como `button` por su nombre accesible, y el
  // estado activo se expone con aria-pressed. Un patrón ARIA tabs completo exigiría manejo de flechas
  // del teclado que este conmutador no necesita.
  return (
    <div role="group" aria-label={ariaLabel}
      className={`gap-0.5 rounded-control border border-line bg-surface p-0.5 ${control ? 'flex w-full' : 'inline-flex'}`}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            aria-pressed={active}
            type="button"
            data-testid={testid ? `${testid}-${o.value}` : undefined}
            onClick={() => onChange(o.value)}
            // SIN `capitalize` EN TAMAÑO CONTROL: la regla CSS capitaliza CADA palabra, y una
            // etiqueta que es una frase —«Sólo este día»— saldría «Sólo Este Día».
            className={`rounded-[5px] font-medium transition ${control ? '' : 'capitalize'} ${pad} ${
              active ? 'bg-accent text-white shadow-card' : 'text-ink hover:bg-surface-sunken'
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
