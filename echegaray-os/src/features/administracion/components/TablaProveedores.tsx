// EL LISTADO DE PROVEEDORES — el maestro canónico.
//
// El CUIT se muestra formateado para leerlo (30-70839055-7) pero se GUARDA sin guiones: el formato
// es de la pantalla, no del dato. Si se guardara con guiones dejaría de cruzar contra ARCA y contra
// el banco, que es para lo único que existe la columna.

import Link from 'next/link'
import type { Proveedor } from '../types'

/** 30708390557 → 30-70839055-7. Sólo para mostrar. */
export function formatearCuit(cuit: string | null): string {
  if (!cuit || cuit.length !== 11) return cuit ?? '—'
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`
}

export function TablaProveedores({
  proveedores,
  seleccionado,
  hrefDe,
}: {
  proveedores: Proveedor[]
  seleccionado?: string
  hrefDe: (proveedorId: string) => string
}) {
  if (proveedores.length === 0) {
    return (
      <p data-testid="proveedores-vacio" className="px-1 py-6 text-[13px] text-muted">
        No hay proveedores que coincidan con lo buscado.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table data-testid="tabla-proveedores" className="w-full min-w-[520px] text-left">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
            <th className="px-3 py-2 font-medium">Proveedor</th>
            <th className="px-3 py-2 font-medium">CUIT</th>
            <th className="px-3 py-2 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {proveedores.map((p) => (
            <tr
              key={p.id}
              data-testid="fila-proveedor"
              className={`border-b border-line/60 last:border-0 hover:bg-surface-quiet ${p.id === seleccionado ? 'bg-surface-quiet' : ''}`}
            >
              <td className="px-3 py-2">
                <Link href={hrefDe(p.id)} className="block min-w-0" data-testid="abrir-proveedor">
                  <span className="text-[13px] text-ink hover:underline">{p.nombre}</span>
                  {p.razon_social && p.razon_social !== p.nombre && (
                    <span className="block truncate text-[11px] text-faint">{p.razon_social}</span>
                  )}
                </Link>
              </td>
              <td className="px-3 py-2 text-[12px] tabular-nums text-muted">
                {p.cuit
                  ? formatearCuit(p.cuit)
                  // Sin CUIT no se puede cruzar con ARCA ni con el banco. Es una falta de dato que
                  // alguien tiene que completar, no un guion más en la tabla.
                  : <span className="text-warn">sin CUIT</span>}
              </td>
              <td className="px-3 py-2 text-[12px]">
                {p.activo ? <span className="text-muted">activo</span> : <span className="text-faint">archivado</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
