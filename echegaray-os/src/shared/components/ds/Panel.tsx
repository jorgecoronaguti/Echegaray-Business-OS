'use client'

import type { ReactNode } from 'react'

// EL PANEL DE DETALLE — `design/system/COMPONENTS.md` §Drawer.
//
// «Panel lateral PERMANENTE (no modal, no overlay) mientras haya selección». Es la regla 9 de
// `UX_PRINCIPLES.md` puesta en un componente: *no sacar al usuario del Gantt para ver el detalle*.
// Un modal tapa la lista y obliga a cerrarlo para comparar con la fila de al lado; un panel que
// convive deja hacer el trabajo real, que es ir mirando una actividad tras otra.
//
// En TABLET pasa a drawer sobre el contenido y en TELÉFONO a pantalla completa: ahí no hay ancho
// para dos zonas, y un panel de 340px sobre una pantalla de 390 es un modal mal hecho.

export function PanelDetalle({
  titulo,
  subtitulo,
  estado,
  onCerrar,
  pie,
  children,
  ancho,
  testid = 'panel-detalle',
}: {
  titulo: ReactNode
  subtitulo?: ReactNode
  estado?: ReactNode
  onCerrar: () => void
  /** La primaria del objeto. Fijo abajo: se llega sin scrollear todo el panel. */
  pie?: ReactNode
  children: ReactNode
  /** Sólo en escritorio; en tablet y teléfono el ancho lo manda la pantalla. */
  ancho?: number
  testid?: string
}) {
  return (
    <>
      {/* El fondo existe SÓLO bajo `lg`, donde el panel sí tapa contenido. En escritorio no hay
          fondo porque no hay nada que tapar — y un fondo invisible que intercepta el primer clic
          es un bug que sólo aparece en el teléfono. */}
      <button
        type="button"
        aria-label="Cerrar el detalle"
        onClick={onCerrar}
        className="fixed inset-0 z-30 bg-ink/20 lg:hidden"
        data-testid="panel-fondo"
      />
      <aside
        data-testid={testid}
        style={ancho ? { ['--ancho-panel' as string]: `${ancho}px` } : undefined}
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l border-line bg-surface lg:static lg:z-0 lg:max-w-none lg:shrink-0 lg:[width:var(--ancho-panel,380px)]"
      >
        <header className="flex items-start gap-3 border-b border-line px-4 py-3 lg:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-[16px] font-semibold leading-tight text-ink">{titulo}</h2>
              {estado}
            </div>
            {subtitulo && <div className="mt-1 text-[12.5px] text-muted">{subtitulo}</div>}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Contraer el panel"
            data-testid="panel-cerrar"
            className="-mr-1 -mt-1 shrink-0 rounded-control px-2 py-1 text-[15px] leading-none text-faint transition-colors hover:bg-surface-quiet hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-5">{children}</div>

        {pie && (
          <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 lg:px-5" data-testid="panel-pie">
            {pie}
          </footer>
        )}
      </aside>
    </>
  )
}

/**
 * PLAN VS REAL — dos columnas enfrentadas y ALINEADAS, separadas por un hairline vertical.
 * Enfrentarlas es el punto: la comparación tiene que poder hacerse con la vista, sin restar de
 * cabeza. Un valor que falta se escribe («sin plan»), nunca se rellena con cero.
 */
export function PlanVsReal({
  plan,
  real,
  desvio,
}: {
  plan: { rotulo: string; valor: ReactNode }[]
  real: { rotulo: string; valor: ReactNode }[]
  /** La lectura. En `neg` sólo si es un problema, no cada vez que hay diferencia. */
  desvio?: { texto: ReactNode; problema?: boolean }
}) {
  return (
    <div data-testid="plan-vs-real">
      <div className="grid grid-cols-2">
        <Columna titulo="Plan" filas={plan} />
        <div className="border-l border-line pl-4">
          <Columna titulo="Real" filas={real} />
        </div>
      </div>
      {desvio && (
        <p className={`mt-3 text-[12.5px] ${desvio.problema ? 'text-neg' : 'text-muted'}`} data-testid="desvio">
          {desvio.texto}
        </p>
      )}
    </div>
  )
}

function Columna({ titulo, filas }: { titulo: string; filas: { rotulo: string; valor: ReactNode }[] }) {
  return (
    <div className="min-w-0 pr-4">
      <div className="mb-2 text-[11px] font-medium tracking-[0.04em] text-faint">{titulo}</div>
      <dl className="space-y-1.5">
        {filas.map((f) => (
          <div key={f.rotulo} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-[12.5px] text-muted">{f.rotulo}</dt>
            <dd className="min-w-0 truncate text-right text-[12.5px] text-ink">{f.valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** La barra de avance del panel: 3px, grafito sobre pista hundida. Sin porcentaje inventado. */
export function BarraAvance({ pct, alto = 3 }: { pct: number | null; alto?: number }) {
  if (pct === null) return null
  const v = Math.max(0, Math.min(100, pct))
  return (
    <div
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      className="w-full overflow-hidden rounded-full bg-surface-sunken"
      style={{ height: alto }}
    >
      <div className={`h-full rounded-full ${v >= 100 ? 'bg-pos' : 'bg-accent'}`} style={{ width: `${v}%` }} />
    </div>
  )
}
