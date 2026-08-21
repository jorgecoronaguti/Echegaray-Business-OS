// LA TABLA DE PAQUETES — una fila por subcontrato de la obra.
//
// La columna CONTRATO existe sólo para quien ve economía. No se dibuja en gris ni con un candado:
// no se dibuja. Un lugar vacío donde va la plata invita a preguntar por qué, y la respuesta —«no
// tenés permiso»— no le sirve a nadie en el medio de una tabla. El comparador, en cambio, SÍ dice
// «sin permiso», porque ahí la fila existe y la comparación se entiende sin el número.
//
// EL ESTADO QUE SE MUESTRA ES EL EFECTIVO, no el guardado: un paquete «en curso» sin ART dice «ART
// sin cargar» en rojo. Ver `estadoDelPaquete`.

import Link from 'next/link'
import { Estado, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { cantidad as fmtCantidad, plata, porcentaje } from './formato'
import type { Paquete } from '../services/subcontratosService'

export function TablaSubcontratos({
  paquetes, seleccionado, economia, href,
}: {
  paquetes: Paquete[]
  seleccionado: string | null
  economia: boolean
  href: (id: string | null) => string
}) {
  if (paquetes.length === 0) {
    return (
      <Vacio>
        Esta obra no tiene ningún paquete subcontratado cargado. Un paquete es una porción del
        alcance de una actividad que ejecuta un tercero — no una compra ni un empleado.
      </Vacio>
    )
  }
  return (
    <Tabla testid="tabla-subcontratos" minWidth={economia ? 780 : 660}>
      <THead>
        <tr>
          <Th>Subcontratista</Th>
          <Th>Dentro de</Th>
          <Th num>Alcance</Th>
          {economia && <Th num>Contrato</Th>}
          <Th num>Avance</Th>
          <Th num>Plazo</Th>
          <Th>Estado</Th>
        </tr>
      </THead>
      <tbody>
        {paquetes.map((p) => (
          <Tr key={p.id} seleccionada={p.id === seleccionado} data-testid={`fila-paquete-${p.id}`}>
            <Td fuerte>
              <Link href={href(p.id === seleccionado ? null : p.id)} scroll={false} className="hover:underline">
                {p.proveedor ?? 'sin subcontratista'}
              </Link>
              <span className="block text-[11px] text-muted">{p.rubro ?? p.nombre}</span>
            </Td>
            <Td>
              {p.vinculos.length === 0
                ? <span className="text-faint">sin actividad vinculada</span>
                : p.vinculos.map((v) => v.actividad).join(' · ')}
            </Td>
            <Td num>{fmtCantidad(p.cantidad, p.unidad)}</Td>
            {economia && (
              <Td num>{p.precio_contratado == null
                ? <span className="text-faint">sin precio</span>
                : plata(p.precio_contratado)}</Td>
            )}
            <Td num>
              {p.avance.pct == null
                ? <span className="text-faint" title={p.avance.base}>—</span>
                : porcentaje(p.avance.pct)}
            </Td>
            <Td num>{p.plazo.texto}</Td>
            <Td>
              <Estado tono={p.estadoLegible.tono} clave={p.estadoLegible.clave}>
                {p.estadoLegible.label}
              </Estado>
            </Td>
          </Tr>
        ))}
      </tbody>
    </Tabla>
  )
}
