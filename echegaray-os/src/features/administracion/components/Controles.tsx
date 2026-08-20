import Link from 'next/link'
import type { ReactNode } from 'react'
import { IconoBuscar } from '@/shared/components/ds'

// LOS CONTROLES DE ADMINISTRACIÓN QUE EL DS NO PUEDE DAR TAL CUAL.
//
// El `Buscador` del design system es un componente de CLIENTE: recibe `onChange`, o sea una función,
// y una función no cruza la frontera del servidor. Las siete pantallas de esta área son server
// components enteros con el estado en la URL —se comparten, se recargan y vuelven con el botón de
// atrás—, así que necesitan la MISMA caja de búsqueda resuelta como un `form` GET.
//
// No es un patrón nuevo: es el mismo hairline inferior con el icono de 13px que describe
// `design/system/COMPONENTS.md` §Inputs («Buscador de lista: sólo hairline inferior + icono 13px»).
// Lo único que cambia es quién lo dibuja.

// LA LUPA ES LA DEL DESIGN SYSTEM. Vivió acá un rato como SVG propio porque la del DS era el
// carácter «⌕», que IBM Plex Sans no trae y el navegador pinta como un rectángulo vacío. Ese
// defecto se corrigió en su origen, así que ésta se reexporta en vez de existir dos veces.
export { IconoBuscar }

/** El buscador de una lista, como formulario GET sobre la propia pantalla. */
export function BuscadorURL({
  accion,
  q,
  placeholder,
  oculto,
  ancho = 'w-full sm:w-[240px]',
  testid,
}: {
  /** La ruta a la que vuelve. Es la misma pantalla: GET sobre sí misma. */
  accion: string
  q?: string
  placeholder: string
  /** Lo que hay que preservar al buscar (el filtro puesto, el panel abierto). */
  oculto?: Record<string, string | undefined>
  ancho?: string
  testid?: string
}) {
  return (
    <form method="get" action={accion} data-testid={testid} className={`min-w-0 shrink-0 ${ancho}`}>
      {Object.entries(oculto ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <div className="flex min-w-0 items-center gap-2 border-b border-line">
        <IconoBuscar />
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder={placeholder}
          aria-label={placeholder}
          data-testid={testid ? `${testid}-q` : undefined}
          className="h-control min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint max-lg:h-control-movil"
        />
      </div>
    </form>
  )
}

/**
 * Los filtros de una lista, como ENLACES.
 *
 * Es el `Filtros` del DS —texto en línea, activo con subrayado `ink` de 1,5px— pero con `Link` de
 * Next en vez de `<a>`: el DS los dibuja con `<a>` porque su versión de cliente no puede navegar
 * sin recargar, y acá una recarga completa por cambiar de filtro tira el scroll de una tabla de 17
 * filas y vuelve a pedir la sesión.
 */
export function FiltrosURL({
  opciones,
  cuenta,
  testid = 'filtros',
}: {
  opciones: { label: ReactNode; href: string; activo?: boolean; testid?: string }[]
  /** `{ n, total }`. Se dibuja sólo si filtrar cambió algo — un «17 de 17» no informa nada. */
  cuenta?: { n: number; total: number } | null
  testid?: string
}) {
  return (
    <div data-testid={testid} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
      {opciones.map((o) => (
        <Link
          key={o.href + String(o.label)}
          href={o.href}
          data-testid={o.testid}
          aria-current={o.activo ? 'true' : undefined}
          className={`pb-[2px] text-[12.5px] transition-colors ${
            o.activo
              ? 'border-b-[1.5px] border-ink font-medium text-ink'
              : 'border-b-[1.5px] border-transparent text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </Link>
      ))}
      {cuenta && cuenta.n !== cuenta.total && (
        <span className="font-mono text-[11.5px] tabular-nums text-faint" data-testid={`${testid}-cuenta`}>
          {cuenta.n} de {cuenta.total}
        </span>
      )}
    </div>
  )
}
