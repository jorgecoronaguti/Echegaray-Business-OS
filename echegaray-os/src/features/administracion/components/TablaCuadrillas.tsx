// EL LISTADO DE CUADRILLAS — cuatro columnas y ninguna guardada.
//
// INTEGRANTES y OBRAS DERIVADAS se calculan al leer: la primera cuenta los períodos abiertos de
// `cuadrilla_integrante`, la segunda junta las obras de las asignaciones vigentes de esa gente.
// Guardarlas obligaría a mantenerlas de acuerdo con la realidad para siempre, y el día que no
// coincidieran nadie se enteraría.

import Link from 'next/link'
import { Nulo, Num, Tabla, Td, Th, THead, Tr } from '@/shared/components/ds'
import type { Cuadrilla } from '../types'

export function TablaCuadrillas({
  cuadrillas, abierta, hrefDe,
}: {
  cuadrillas: Cuadrilla[]
  abierta?: string
  hrefDe: (id: string) => string
}) {
  return (
    <Tabla testid="tabla-cuadrillas" minWidth={640}>
      <THead>
        <Th>Cuadrilla</Th>
        <Th>Responsable</Th>
        <Th num>Integrantes</Th>
        <Th>Obras (derivadas)</Th>
      </THead>
      <tbody>
        {cuadrillas.map((c) => (
          <Tr key={c.id} data-testid="fila-cuadrilla" seleccionada={c.id === abierta}>
            <Td fuerte>
              <Link href={hrefDe(c.id)} className="text-[13px] text-ink hover:underline" data-testid="abrir-cuadrilla">
                {c.nombre}
              </Link>
              {!c.activa && <span className="ml-2 text-[10px] text-faint">archivada</span>}
            </Td>
            <Td className="w-[190px]">
              {c.responsable ?? <Nulo>sin responsable</Nulo>}
            </Td>
            <Td num className="w-[110px]"><Num className="text-muted">{c.integrantes}</Num></Td>
            <Td className="w-[240px]">
              {c.obras_actuales ?? <Nulo>sin obra vigente</Nulo>}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Tabla>
  )
}
