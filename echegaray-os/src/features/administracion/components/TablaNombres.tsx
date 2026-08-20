// LOS NOMBRES DE COMPRAS QUE TODAVÍA NO SON NADIE — la cola, ordenada por lo que pesa.
//
// `Compras!E` del Sheet es texto libre y su espejo en Postgres (`costos_obra.proveedor`) tiene 845
// comprobantes con 112 grafías distintas. 33 coinciden EXACTAMENTE con un proveedor del maestro; las
// otras 79 —284 comprobantes, $382,8M— no son nadie. Medido el 18/08/2026.
//
// Ordenada por importe: resolver «Sueldos» (58 comprobantes, $197,5M) mueve más que resolver
// «Google» ($114). Y arriba de la lista hay cuatro cosas que NO son proveedores —SUELDOS, ARCA,
// SINDICATOS, BANCO—, que es exactamente por lo que no puede existir un botón de "vincular todo lo
// parecido": un emparejador por similitud las habría colgado del proveedor de nombre más cercano.

import Link from 'next/link'
import { fecha, plata } from '@/features/obras/components/formato'
import { BotonAccion, type ResultadoAccion } from '@/shared/components/ui'
import { Eyebrow, Nulo, Num, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import type { NombrePendiente, NombreResuelto } from '../types'

export function TablaNombres({ pendientes, seleccionado, hrefDe }: {
  pendientes: NombrePendiente[]
  seleccionado?: string
  hrefDe: (nombreNorm: string) => string
}) {
  if (pendientes.length === 0) {
    return (
      <div data-testid="cola-vacia">
        <Vacio>Todos los nombres de compras tienen proveedor. No hay nada que resolver.</Vacio>
      </div>
    )
  }

  return (
    <Tabla testid="cola-nombres" minWidth={560}>
      <THead>
        <Th>Nombre en el Sheet</Th>
        <Th num>Comprob.</Th>
        <Th num>Importe</Th>
        <Th>Período</Th>
      </THead>
      <tbody>
        {pendientes.map((n) => (
          <Tr key={n.nombre_norm} data-testid="nombre-pendiente" seleccionada={n.nombre_norm === seleccionado}>
            <Td fuerte>
              <Link href={hrefDe(n.nombre_norm)} data-testid="abrir-nombre" className="block min-w-0">
                <span className="text-[13px] text-ink hover:underline">{n.nombre_origen}</span>
              </Link>
            </Td>
            <Td num className="w-[100px] text-muted">{n.comprobantes}</Td>
            <Td num fuerte className="w-[150px]">{plata(n.total)}</Td>
            <Td className="w-[170px]">
              <Num className="text-faint">{fecha(n.primera_fecha)} → {fecha(n.ultima_fecha)}</Num>
            </Td>
          </Tr>
        ))}
      </tbody>
    </Tabla>
  )
}

/** Lo ya resuelto a mano, con su deshacer. Un vínculo equivocado que no se puede sacar es peor que
 *  el pendiente: el costo queda imputado a un proveedor que nunca facturó eso. */
export function NombresResueltos({ resueltos, deshacer }: {
  resueltos: NombreResuelto[]
  deshacer: (aliasId: string) => Promise<ResultadoAccion>
}) {
  const manuales = resueltos.filter((r) => r.alias_id)
  if (manuales.length === 0) return null

  return (
    <section className="mt-8">
      <Eyebrow className="mb-2">Resueltos a mano · {manuales.length}</Eyebrow>
      <div data-testid="cola-resueltos">
        {manuales.map((r) => (
          <div
            key={r.nombre_norm}
            data-testid="nombre-resuelto"
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[#EFEEEA] py-2.5 last:border-0"
          >
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{r.nombre_norm}</span>
            <span className="text-[11.5px] text-muted">
              {r.estado === 'no_es_proveedor'
                ? <Nulo>no es un proveedor</Nulo>
                : (r.proveedor_nombre ?? <Nulo>sin proveedor</Nulo>)}
            </span>
            <Num className="text-faint">{r.comprobantes}</Num>
            {r.alias_id && (
              <BotonAccion accion={deshacer} args={[r.alias_id]} testid="deshacer-resolucion">
                Deshacer
              </BotonAccion>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
