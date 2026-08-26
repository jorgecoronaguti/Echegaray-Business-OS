'use client'

import { useRouter } from 'next/navigation'
import { rotuloDeObra, type GrupoDeCliente } from '@/features/administracion/services/selectorObras'

// ELEGIR LA OBRA — agrupada por cliente, con el cliente escrito.
//
// Antes eran pastillas en una fila plana ordenada por estado y después por nombre: dos obras del
// mismo cliente quedaban separadas por la de otro, y de quién era cada una se leía en gris de 11px.
// El dueño (26/08/2026): *"es un desastre lo hecho en el manejo del cronograma mezcla todas las
// obras"*. Elegir la obra equivocada acá le publica a un cliente los cobros de otro.
//
// `<optgroup>` y no una lista de botones: con doce obras las pastillas ocupaban tres renglones y el
// agrupamiento no se veía; el navegador ya sabe dibujar un grupo con su título y no se rompe en el
// teléfono. Se navega al elegir —la URL sigue siendo la fuente de la selección, compartible y
// deshacible con el botón de atrás— y no hay estado local que pueda quedar desincronizado.

export function SelectorObra({ grupos, elegida }: { grupos: readonly GrupoDeCliente[]; elegida: string | null }) {
  const router = useRouter()
  return (
    <select
      aria-label="Obra"
      value={elegida ?? ''}
      onChange={(e) => router.push(`/administracion/cronograma?obra=${e.target.value}`)}
      className="min-h-10 min-w-[280px] max-w-full rounded-control border border-line-strong bg-surface px-2.5 text-[13px] outline-none focus:border-ink"
    >
      {/* Sólo existe mientras no hay ninguna elegida: dejarlo después sería ofrecer «ninguna obra». */}
      {elegida == null && <option value="">Elegí una obra</option>}
      {grupos.map((g) => (
        <optgroup key={g.cliente} label={g.cliente}>
          {g.obras.map((o) => (
            <option key={o.id} value={o.id}>{rotuloDeObra(o)}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
