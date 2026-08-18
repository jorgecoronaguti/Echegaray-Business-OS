// EL LISTADO DE PERSONAS — compacto, para leer treinta filas de un vistazo.
//
// La fila entera es el enlace que abre el panel: en un listado de trabajo, apuntar a un lápiz de
// 16px con el dedo es la diferencia entre usarlo y no usarlo. La selección viaja en la URL (`?p=`),
// así que la fila abierta sobrevive a una recarga y se puede pasar por chat.

import Link from 'next/link'
import { esCategoriaDeConvenio, etiquetaCategoria, type Persona } from '../types'

export function TablaPersonas({
  personas,
  seleccionada,
  hrefDe,
  conteoAsignaciones,
}: {
  personas: Persona[]
  seleccionada?: string
  /** Cómo se arma el enlace de una fila, conservando los filtros vigentes. */
  hrefDe: (personaId: string) => string
  conteoAsignaciones: Map<string, number>
}) {
  if (personas.length === 0) {
    return (
      <p data-testid="personas-vacio" className="px-1 py-6 text-[13px] text-muted">
        No hay personas que coincidan con lo buscado.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table data-testid="tabla-personas" className="w-full min-w-[560px] text-left">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
            <th className="px-3 py-2 font-medium">Persona</th>
            <th className="px-3 py-2 font-medium">Categoría</th>
            <th className="px-3 py-2 font-medium">Documento</th>
            <th className="px-3 py-2 text-right font-medium">Obras</th>
            <th className="px-3 py-2 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {personas.map((p) => {
            const abierta = p.id === seleccionada
            const obras = conteoAsignaciones.get(p.id) ?? 0
            return (
              <tr
                key={p.id}
                data-testid="fila-persona"
                className={`border-b border-line/60 last:border-0 hover:bg-surface-quiet ${abierta ? 'bg-surface-quiet' : ''}`}
              >
                <td className="px-3 py-2">
                  <Link href={hrefDe(p.id)} className="block min-w-0" data-testid="abrir-persona">
                    <span className="text-[13px] text-ink hover:underline">{p.nombre_completo}</span>
                    {p.especialidad && (
                      <span className="block truncate text-[11px] text-faint">{p.especialidad}</span>
                    )}
                  </Link>
                </td>
                <td className="px-3 py-2 text-[12px] text-muted">
                  {etiquetaCategoria(p.categoria)}
                  {/* Un código mal importado no se esconde ni se corrige solo: se marca para que
                      alguien lo mire. Naranja porque es un problema de dato, no una decoración. */}
                  {p.categoria && !esCategoriaDeConvenio(p.categoria) && (
                    <span className="block text-[10px] text-warn">fuera de convenio</span>
                  )}
                </td>
                <td className="px-3 py-2 text-[12px] tabular-nums text-muted">{p.dni ?? p.cuil ?? '—'}</td>
                <td className="px-3 py-2 text-right text-[12px] tabular-nums text-muted">
                  {obras > 0 ? obras : '—'}
                </td>
                <td className="px-3 py-2 text-[12px]">
                  {p.fecha_egreso
                    ? <span className="text-faint">egresada</span>
                    : <span className="text-muted">activa</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
