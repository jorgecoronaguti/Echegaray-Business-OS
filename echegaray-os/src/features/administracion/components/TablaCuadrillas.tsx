// EL LISTADO DE CUADRILLAS — cuatro columnas y ninguna guardada.
//
// INTEGRANTES y OBRAS ACTUALES se calculan al leer: la primera cuenta los períodos abiertos de
// `cuadrilla_integrante`, la segunda junta las obras de las asignaciones vigentes de esa gente.
// Guardarlas sería tener que mantenerlas de acuerdo con la realidad para siempre.

import Link from 'next/link'
import type { Cuadrilla } from '../types'

export function TablaCuadrillas({
  cuadrillas, abierta, hrefDe,
}: {
  cuadrillas: Cuadrilla[]
  abierta?: string
  hrefDe: (id: string) => string
}) {
  return (
    <div className="overflow-x-auto">
      <table data-testid="tabla-cuadrillas" className="w-full min-w-[520px] text-left">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
            <th className="px-3.5 py-2 font-medium">Cuadrilla</th>
            <th className="px-3 py-2 font-medium">Responsable</th>
            <th className="px-3 py-2 text-right font-medium">Integrantes</th>
            <th className="px-3 py-2 font-medium">Obra actual</th>
          </tr>
        </thead>
        <tbody>
          {cuadrillas.map((c) => (
            <tr
              key={c.id}
              data-testid="fila-cuadrilla"
              className={`border-b border-line/60 last:border-0 hover:bg-surface-quiet ${c.id === abierta ? 'bg-surface-quiet' : ''}`}
            >
              <td className="px-3.5 py-2">
                <Link href={hrefDe(c.id)} className="text-[13px] text-ink hover:underline" data-testid="abrir-cuadrilla">
                  {c.nombre}
                </Link>
                {!c.activa && <span className="ml-2 text-[10px] text-faint">archivada</span>}
              </td>
              <td className="px-3 py-2 text-[12px] text-muted">{c.responsable ?? '—'}</td>
              <td className="px-3 py-2 text-right text-[12px] tabular-nums text-muted">{c.integrantes}</td>
              <td className="px-3 py-2 text-[12px] text-muted">{c.obras_actuales ?? 'sin asignar'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
