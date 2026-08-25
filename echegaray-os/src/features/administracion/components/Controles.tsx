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
 * Es el `Filtros` del DS pero con `Link` de Next en vez de `<a>`: el DS los dibuja con `<a>` porque
 * su versión de cliente no puede navegar sin recargar, y acá una recarga completa por cambiar de
 * filtro tira el scroll de una tabla de 17 filas y vuelve a pedir la sesión.
 *
 * ═══ PASTILLA, NO SUBRAYADO (porte 24/08) ═══
 *
 * Este archivo seguía dibujando el subrayado `ink` de 1,5px de `COMPONENTS.md`. El mismo día que se
 * midió el zip, `ds/Filtros` pasó a PASTILLA por orden del dueño —fondo #30302F y texto blanco
 * cuando está activo, borde #E7E6E2 sobre blanco cuando no— y esta copia se quedó atrás. El
 * resultado era el defecto que este componente existe para evitar: el mismo filtro con dos
 * aspectos según la pantalla que lo dibuja. Los valores son los de `ds/Filtros`, que salieron de
 * `03 · Obra Tareas.dc.html` líneas 96 y 648-649, y son los mismos de las cinco carteras del zip.
 *
 * ═══ SIN PRECARGA, Y ES LO QUE MÁS PESABA DE TODO EL OS (25/08/2026) ═══
 *
 * Cada pastilla apunta a LA MISMA pantalla con otra query. Next precarga solo los `Link` que entran
 * en pantalla, y como acá entran todos, abrir una lista disparaba un render de servidor COMPLETO por
 * cada filtro dibujado — con sus consultas, su middleware y su sesión.
 *
 * MEDIDO el 25/08 con el middleware instrumentado, UNA visita:
 *
 *   /documentos ····················· 77 pasadas por el middleware
 *   /administracion/proveedores ····· 51
 *   /clientes ······················· 14
 *   una pantalla sin filtros ········  3
 *
 * O sea: 74 renders de `/documentos` para dibujar `/documentos` una vez. El propio dueño lo describe
 * como *"todo es MUY lento"*, y es esto: un usuario abriendo una lista ocupa el servidor como
 * setenta.
 *
 * Precargar acá además no sirve para nada: el destino es `force-dynamic`, así que el payload no se
 * reusa entre el prefetch y el clic. `ChipsCanon` —el mismo control del canónico— ya lo tenía en
 * `false`; esta copia se había quedado atrás.
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
    <div data-testid={testid} className="flex min-w-0 flex-wrap items-center gap-2">
      {opciones.map((o) => (
        <Link
          key={o.href + String(o.label)}
          href={o.href}
          prefetch={false}
          data-testid={o.testid}
          aria-current={o.activo ? 'true' : undefined}
          className={`inline-flex items-center gap-[5px] rounded-[6px] border px-[9px] py-[4px] text-[12px] transition-colors ${
            o.activo
              ? 'border-[#30302F] bg-[#30302F] text-white'
              : 'border-[#E7E6E2] bg-white text-[#3A3A38] hover:border-[#C9C4C2]'
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
