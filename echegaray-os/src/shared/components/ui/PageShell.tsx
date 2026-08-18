import type { ReactNode } from 'react'

// PAGESHELL — EL MARCO DE PÁGINA DEL OS.
//
// ═══ UN SOLO ANCHO ÚTIL, Y EL MISMO BORDE IZQUIERDO SIEMPRE (18/08/2026) ═══
//
// El header global vive en `mx-auto max-w-[1400px] px-4 sm:px-6` y cada página traía el suyo
// (`max-w-6xl`, `max-w-7xl`, `max-w-3xl`), centrado por su cuenta. El resultado: el logo arrancaba en
// una vertical y el título de la página en otra, distinta en cada pantalla — y al navegar, el
// contenido saltaba de costado. El dueño pidió *"contenido centrado con ancho consistente"*.
//
// Ahora el CONTENEDOR es siempre el del header, idéntico al carácter: `max-w-[1400px] px-4 sm:px-6`.
// Lo que cambia por página es el ANCHO DE LECTURA de adentro, y ese ancho NO se centra: se alinea a
// la izquierda. Una pantalla angosta sigue siendo angosta —una columna de texto de 1400px no se
// lee—, pero empieza donde empiezan todas las demás.
//
// ═══ DENSIDAD (§ el dueño, 18/08) ═══
//
// *"Quiero aprovechar mejor el espacio… No hacer contenido minúsculo centrado en una pantalla
// enorme. En desktop el workspace de Obra y especialmente el Gantt pueden utilizar aproximadamente
// 80–90% del ancho útil."* Por eso el default es el ancho completo: la excepción es angostar, y hay
// que pedirla. Administración la pide; el workspace de obra, no.

export function PageShell({
  eyebrow,
  title,
  subtitle,
  right,
  children,
  maxWidth = 'max-w-full',
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
      <div className="mx-auto max-w-[1400px] px-4 py-7 sm:px-6">
        <div className={maxWidth}>
          <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              {eyebrow && <div className="text-[11px] font-medium uppercase tracking-wide text-faint">{eyebrow}</div>}
              <h1 className="mt-1 text-[22px] font-semibold leading-tight text-ink">{title}</h1>
              {subtitle && <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">{subtitle}</p>}
            </div>
            {/* `shrink-0` sin `min-w-0` empujaba la página entera de costado en el teléfono: la línea
                de ciclo de vida de la obra mide más que 390px y no podía encoger. Ahora no encoge
                cuando hay lugar, y cuando no lo hay se acomoda en vez de desbordar. */}
            {right && <div className="min-w-0 shrink-0 max-w-full">{right}</div>}
          </header>
          {children}
        </div>
      </div>
    </div>
  )
}
