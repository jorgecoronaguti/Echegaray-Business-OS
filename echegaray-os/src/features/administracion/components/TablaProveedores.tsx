// EL LISTADO DE PROVEEDORES — el maestro canónico, identificado por CUIT.
//
// El CUIT se MUESTRA formateado para leerlo (30-70839055-7) pero se GUARDA sin guiones: el formato
// es de la pantalla, no del dato. Guardado con guiones dejaría de cruzar contra ARCA y contra el
// banco, que es para lo único que existe la columna.

import Link from 'next/link'
import { Nulo, Tabla, Td, Th, THead, Tr } from '@/shared/components/ds'
// El formateo vive en `services/identidad.ts` y no acá: en un archivo con JSX `node --test` no lo
// puede ejercitar, y un formateador que parte a ciegas convierte un dato roto en uno con forma de
// válido. Se re-exporta para no romper a quien ya lo importaba desde este componente.
import { formatearCuit } from '../services/identidad'
import type { Proveedor } from '../types'

export { formatearCuit }

export function TablaProveedores({
  proveedores, seleccionado, hrefDe,
}: {
  proveedores: Proveedor[]
  seleccionado?: string
  hrefDe: (proveedorId: string) => string
}) {
  return (
    <Tabla testid="tabla-proveedores" minWidth={560}>
      <THead>
        <Th>Proveedor</Th>
        <Th>CUIT</Th>
        <Th>Estado</Th>
      </THead>
      <tbody>
        {proveedores.map((p) => (
          <Tr key={p.id} data-testid="fila-proveedor" seleccionada={p.id === seleccionado}>
            <Td fuerte>
              <Link href={hrefDe(p.id)} className="block min-w-0" data-testid="abrir-proveedor">
                <span className="text-[13px] text-ink hover:underline">{p.nombre}</span>
                {p.razon_social && p.razon_social !== p.nombre && (
                  <span className="block truncate text-[11px] text-faint">{p.razon_social}</span>
                )}
              </Link>
            </Td>
            <Td className="w-[170px]">
              {p.cuit
                ? <span className="font-mono text-[12px] tabular-nums text-muted">{formatearCuit(p.cuit)}</span>
                // SIN CUIT NO ES UN HUECO: es un dato que falta y que BLOQUEA — sin él la compra no
                // cruza con ARCA ni con el banco. Por eso va en ámbar y con el motivo al lado en la
                // ficha, no como un guión más en la tabla.
                : <span className="text-[12px] text-warn">sin CUIT</span>}
            </Td>
            <Td className="w-[110px]">
              {p.activo
                ? <span data-estado="activo" className="text-[12px] text-muted">activo</span>
                : <span data-estado="archivado"><Nulo>archivado</Nulo></span>}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Tabla>
  )
}
