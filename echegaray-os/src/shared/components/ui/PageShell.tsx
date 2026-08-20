import type { ReactNode } from 'react'

// PAGESHELL — EL MARCO DE PÁGINA DEL OS.
//
// ═══ LO QUE MANDA ACÁ ES `design/system/LAYOUT_RESPONSIVE.md` (20/08/2026) ═══
//
// Padding de pantalla: 40px en escritorio (`lg:px-10`), 16px en el teléfono (`px-4`). El
// contenedor NO tiene tope de ancho: los workspaces operativos —Planificación, Ejecución, las
// tablas de cartera— usan todo lo que haya. El tope se pide por pantalla, no se impone a todas.
//
// ═══ EL ANCHO DE LECTURA ES UNA DECISIÓN POR PANTALLA, NO UN DEFAULT ═══
//
// Una tabla de dos columnas estirada a 1440px es ilegible: el ojo pierde la fila entre el nombre y
// el dato. Por eso `LECTURA` publica los tres anchos del handoff —lista corta 680, formulario 560,
// ficha con aside— y cada pantalla elige el suyo. El ancho NO se centra: se alinea a la izquierda,
// para que el título de una pantalla angosta empiece en la misma vertical que el de una ancha y el
// contenido no salte de costado al navegar.
//
// ═══ EL TÍTULO MIDE 22px Y NO ESCALA CON LA PANTALLA ═══
//
// Tenía un `clamp()` que lo llevaba hasta 64px en un monitor grande. La escala tipográfica del
// handoff tiene NUEVE tamaños fijos y el título de pantalla es uno de ellos: un h1 que crece con
// el viewport rompe la relación con los 14px del nivel 2 y los 13px de la celda, que es
// exactamente lo que una escala existe para sostener. Densidad se gana con más filas visibles, no
// con letra más grande.

/** Los anchos de lectura del handoff. Se eligen; no hay un default que sirva para todo. */
export const LECTURA = {
  /** Workspaces operativos y tablas de cartera: todo el ancho. */
  completo: 'max-w-full',
  /** Lista de lectura corta (dos o tres columnas), p. ej. Clientes. */
  lista: 'max-w-[680px]',
  /** Formulario. */
  formulario: 'max-w-[560px]',
} as const

export function PageShell({
  eyebrow,
  title,
  subtitle,
  right,
  children,
  maxWidth = LECTURA.completo,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  children: ReactNode
  /** Ancho de LECTURA del contenido, alineado a la izquierda. El contenedor no cambia nunca. */
  maxWidth?: string
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <div className="w-full px-4 py-6 lg:px-10">
        <div className={maxWidth}>
          <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              {eyebrow && <div className="text-[11px] font-medium tracking-[0.04em] text-faint">{eyebrow}</div>}
              <h1 className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">{title}</h1>
              {subtitle && <div className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{subtitle}</div>}
            </div>
            {/* `shrink-0` sin `min-w-0` empujaba la página entera de costado en el teléfono: la línea
                de ciclo de vida de la obra mide más que 390px y no podía encoger. */}
            {right && <div className="min-w-0 max-w-full shrink-0">{right}</div>}
          </header>
          {children}
        </div>
      </div>
    </div>
  )
}
