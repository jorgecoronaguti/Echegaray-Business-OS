import Link from 'next/link'
import type { ReactNode } from 'react'

// LOS CONTROLES DE ADMINISTRACIÓN QUE EL DS NO PUEDE DAR TAL CUAL.
//
// Quedó UNO. El buscador con estado en la URL vivía acá porque el `Buscador` del design system es
// de cliente —recibe `onChange`, o sea una función, y una función no cruza la frontera del
// servidor— y las pantallas de esta área son server components enteros. Esa copia es la que hacía
// que la misma lupa tuviera tres comportamientos: el del DS filtraba al teclear y ésta exigía
// Enter. Se resolvió al revés de como estaba: el DS ahora trae `BuscadorURL`, que dibuja el mismo
// `Buscador` y le pone la navegación encima, y desde acá no hay nada que redibujar.
//
// `FiltrosURL` sí se queda: es el `Filtros` del DS con `Link` de Next, y esa diferencia no es de
// estilo sino de comportamiento (ver abajo).

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
