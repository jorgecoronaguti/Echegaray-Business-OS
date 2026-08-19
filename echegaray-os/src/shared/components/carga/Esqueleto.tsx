// LOS ESQUELETOS — la forma de la pantalla que viene, no un cuadrado gris.
//
// Un esqueleto genérico y un spinner dicen lo mismo ("esperá"), pero el esqueleto dice además QUÉ
// está por aparecer: cuántas columnas, dónde el título, dónde la tabla. Cuando llega el contenido no
// hay salto —los bloques ya están donde va el dato— y la espera se siente más corta que el reloj.
// Por eso cada `loading.tsx` de este OS dibuja SU pantalla, y estas piezas son sólo el vocabulario.
//
// EL COLOR ES `surface-sunken`, el token de "pista apagada" que ya usa el sistema. Un esqueleto no
// es un estado: no lleva color semántico ni el amarillo de la marca. El único movimiento es el
// `animate-pulse` de Tailwind, y bajo `motion-safe`.

export function Linea({ className = '' }: { className?: string }) {
  return <span className={`block h-3 rounded bg-surface-sunken ${className}`} />
}

export function Bloque({ className = '' }: { className?: string }) {
  return <div className={`rounded-card bg-surface-sunken ${className}`} />
}

/** El encabezado de `PageShell`: el mismo hueco que va a ocupar el título real. */
export function EncabezadoEsqueleto({ ancho = 'w-40' }: { ancho?: string }) {
  return (
    <header className="mb-6">
      <Linea className={`h-5 ${ancho}`} />
      <Linea className="mt-2.5 h-3 w-72 max-w-full" />
    </header>
  )
}

/**
 * UNA TABLA CON SUS COLUMNAS. `cols` no es decoración: con el número real de columnas de la pantalla
 * que viene, el ancho de cada una queda donde va a quedar y la tabla no se reacomoda al llegar.
 */
export function TablaEsqueleto({ cols, filas = 6 }: { cols: number; filas?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface motion-safe:animate-pulse" data-testid="esqueleto-tabla">
      <div className="flex gap-4 border-b border-line px-4 py-3">
        {Array.from({ length: cols }, (_, i) => (
          <Linea key={i} className="h-2.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: filas }, (_, f) => (
        <div key={f} className="flex gap-4 border-b border-line/60 px-4 py-3.5 last:border-0">
          {Array.from({ length: cols }, (_, i) => (
            // La primera columna es siempre el nombre de la cosa: más larga, y más oscura.
            <Linea key={i} className={i === 0 ? 'h-3 flex-1' : 'h-3 flex-1 opacity-70'} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** El marco compartido por todos los `loading.tsx`: mismo contenedor y mismo margen que `PageShell`. */
export function PantallaEsqueleto({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas" data-testid="esqueleto-carga" aria-busy="true" aria-live="polite">
      <div className="mx-auto max-w-[1400px] px-4 py-7 sm:px-6">{children}</div>
      <span className="sr-only">Cargando…</span>
    </div>
  )
}
