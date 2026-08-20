'use client'

import type { ReactNode } from 'react'

// LOS CONTROLES DE ENTRADA — `design/system/COMPONENTS.md` §Inputs.
//
// 34px de alto en escritorio, 48 en el teléfono; borde `line-strong` (el borde de campo editable,
// más presente que el de bloque, porque un campo tiene que verse tocable); radio 6; texto 13.
//
// La clase se exporta como constante además del componente: hay formularios del OS que necesitan
// pintar un `<select>` nativo o un input controlado por una librería, y la alternativa a compartir
// la clase es que cada uno se dibuje su propio campo un píxel distinto.

export const CAMPO =
  'h-control w-full rounded-control border border-line-strong bg-surface px-2.5 text-[13px] text-ink placeholder:text-faint transition-colors focus:border-ink/30 disabled:bg-surface-sunken disabled:text-faint max-lg:h-control-movil'

export function Campo({
  rotulo,
  ayuda,
  error,
  children,
  className = '',
}: {
  rotulo?: ReactNode
  ayuda?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      {rotulo && <span className="mb-1 block text-[12.5px] text-ink-soft">{rotulo}</span>}
      {children}
      {ayuda && !error && <span className="mt-1 block text-[11.5px] text-faint">{ayuda}</span>}
      {error && <span className="mt-1 block text-[11.5px] text-neg">{error}</span>}
    </label>
  )
}

/**
 * El buscador de una lista: SÓLO hairline inferior + icono. Sin caja.
 * Un buscador con borde completo arriba de una tabla sin caja es la caja que la tabla no tiene.
 */
export function Buscador({
  value,
  onChange,
  placeholder = 'Buscar',
  testid = 'buscador',
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  testid?: string
  className?: string
}) {
  return (
    <div className={`flex min-w-0 items-center gap-2 border-b border-line ${className}`}>
      <span aria-hidden className="shrink-0 text-[13px] text-faint">
        ⌕
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testid}
        aria-label={placeholder}
        className="h-control min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint max-lg:h-control-movil"
      />
    </div>
  )
}

// ═══ FILTROS ═══
//
// «Texto en línea, activo subrayado; contador "N de M" a la derecha. NO aparecen con una sola
// fila.» Lo último es la regla que más se olvida: un filtro sobre una lista de un elemento no es
// una ayuda, es una fila de interfaz que no hace nada. Y el estado va a la URL, para que la vista
// filtrada se pueda pasar por chat.
export function Filtros({
  opciones,
  cuenta,
  testid = 'filtros',
}: {
  opciones: { label: ReactNode; href?: string; onClick?: () => void; activo?: boolean; testid?: string }[]
  /** `{ n, total }`. Se dibuja sólo si filtrar cambió algo. */
  cuenta?: { n: number; total: number } | null
  testid?: string
}) {
  return (
    <div data-testid={testid} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
      {opciones.map((o, k) => {
        const clase = `pb-[2px] text-[12.5px] transition-colors ${
          o.activo ? 'border-b-[1.5px] border-ink font-medium text-ink' : 'border-b-[1.5px] border-transparent text-muted hover:text-ink'
        }`
        return o.href ? (
          <a key={o.href} href={o.href} data-testid={o.testid} aria-current={o.activo ? 'true' : undefined} className={clase}>
            {o.label}
          </a>
        ) : (
          <button key={k} type="button" onClick={o.onClick} data-testid={o.testid} aria-pressed={o.activo} className={clase}>
            {o.label}
          </button>
        )
      })}
      {cuenta && cuenta.n !== cuenta.total && (
        <span className="ml-auto font-mono text-[11.5px] tabular-nums text-faint" data-testid="filtros-cuenta">
          {cuenta.n} de {cuenta.total}
        </span>
      )}
    </div>
  )
}
