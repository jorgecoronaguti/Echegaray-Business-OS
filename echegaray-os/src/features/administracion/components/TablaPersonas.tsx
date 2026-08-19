// EL LISTADO DE PERSONAL — cinco columnas, y ninguna de más.
//
// El dueño, textual: *"PERSONA | CATEGORÍA | CUADRILLA | OBRA ACTUAL | ESTADO. Nada más. NO mostrar
// en la tabla DNI, CUIL, sueldo, teléfono, documentación ni métricas."*
//
// No es sólo una decisión visual: lo que la tabla no muestra tampoco se pide a la base. El listado
// sale de `persona_directorio`, que no publica documento ni retribución, así que ese dato no viaja
// al navegador aunque alguien abra las herramientas de desarrollo.
//
// CUADRILLA y OBRA ACTUAL son DERIVADAS —de la pertenencia vigente y de la asignación vigente—, no
// columnas guardadas. Por eso no pueden quedar desactualizadas respecto de la ficha.

import Link from 'next/link'
import { esCategoriaDeConvenio, etiquetaCategoria, type PersonaEnDirectorio } from '../types'

export function TablaPersonas({ personas }: { personas: PersonaEnDirectorio[] }) {
  if (personas.length === 0) {
    return (
      <p data-testid="personas-vacio" className="px-1 py-6 text-[13px] text-muted">
        No hay personas que coincidan con lo buscado.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table data-testid="tabla-personas" className="w-full min-w-[680px] text-left">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
            <th className="px-3.5 py-2 font-medium">Persona</th>
            <th className="px-3 py-2 font-medium">Categoría</th>
            <th className="px-3 py-2 font-medium">Cuadrilla</th>
            <th className="px-3 py-2 font-medium">Obra actual</th>
            <th className="px-3 py-2 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {personas.map((p) => (
            <tr
              key={p.id}
              data-testid="fila-persona"
              className="border-b border-line/60 last:border-0 hover:bg-surface-quiet"
            >
              <td className="px-3.5 py-2">
                {/* La fila entera lleva a la ficha: en un listado de trabajo, apuntar a un lápiz de
                    16px con el dedo es la diferencia entre usarlo y no usarlo. */}
                <Link
                  href={`/administracion/personas/${p.id}`}
                  className="block min-w-0"
                  data-testid="abrir-persona"
                >
                  <span className="text-[13px] text-ink hover:underline">{p.nombre_completo}</span>
                  {(p.puesto ?? p.especialidad) && (
                    <span className="block truncate text-[11px] text-faint">{p.puesto ?? p.especialidad}</span>
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
              <td className="px-3 py-2 text-[12px] text-muted">{p.cuadrilla ?? '—'}</td>
              <td className="px-3 py-2 text-[12px]">
                {p.obra_actual_id
                  ? (
                      <Link href={`/obras/${p.obra_actual_id}`} className="text-ink hover:underline">
                        {p.obra_actual_id}
                      </Link>
                    )
                  : <span className="text-faint">sin asignar</span>}
              </td>
              <td className="px-3 py-2 text-[12px]">
                {p.fecha_egreso
                  ? <span className="text-faint">inactiva</span>
                  : <span className="text-muted">activa</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
