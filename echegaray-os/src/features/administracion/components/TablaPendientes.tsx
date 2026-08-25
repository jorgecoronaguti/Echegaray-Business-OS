// LA COLA DE IMPUTACIÓN — una fila por TEXTO, no por comprobante.
//
// El orden por defecto es por importe descendente, que es el pedido del dueño: *"lo que más plata
// mueve, primero"*. Herramientas, pedidos y movimientos no tienen importe —mueven un recurso, no
// pesos— y caen al fondo con la cantidad de filas como desempate. Poner 0 en vez de decir «sin
// importe» los mezclaría con compras de $0 y haría creer que ese trabajo no vale nada.
//
// La columna «Sugerido» está casi siempre vacía, y eso NO es un defecto: significa que no hay
// evidencia. La alternativa —rellenarla con el nombre más parecido— es la que fabrica costo en la
// obra equivocada.

import Link from 'next/link'
import { plata } from '@/features/obras/components/formato'
import { Nulo, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { ETIQUETA_TIPO, type GrupoPendiente } from '../services/imputacionService'

function Sugerido({ grupo, nombreDeObra }: {
  grupo: GrupoPendiente
  nombreDeObra: (obraId: string) => string
}) {
  if (!grupo.sugerencia) {
    return <span className="text-[11px] text-faint">Sin evidencia previa. No se propone obra por parecido de nombre.</span>
  }
  return (
    <span
      data-testid="sugerencia"
      className={`text-[11px] ${grupo.sugerencia.preseleccionar ? 'text-ink-soft' : 'text-faint'}`}
    >
      Sugerido: {nombreDeObra(grupo.sugerencia.obra_id)}
      {!grupo.sugerencia.preseleccionar && ' · a confirmar'}
    </span>
  )
}

export function TablaPendientes({ grupos, seleccionada, hrefDe, nombreDeObra }: {
  grupos: GrupoPendiente[]
  seleccionada?: string
  hrefDe: (clave: string) => string
  nombreDeObra: (obraId: string) => string
}) {
  if (grupos.length === 0) {
    return (
      <div data-testid="pendientes-vacio">
        <Vacio>No queda ningún texto sin clasificar en compras, pedidos, herramientas ni movimientos.</Vacio>
      </div>
    )
  }

  return (
    <Tabla testid="tabla-pendientes" minWidth={620}>
      <THead>
        <Th>Texto sin resolver</Th>
        <Th>Fuente</Th>
        <Th num>Filas</Th>
        <Th num>Importe</Th>
      </THead>
      <tbody>
        {grupos.map((g) => (
          <Tr key={g.clave} data-testid="fila-pendiente" seleccionada={g.clave === seleccionada}>
            <Td fuerte>
              <Link href={hrefDe(g.clave)} prefetch={false} data-testid="abrir-pendiente" className="block min-w-0">
                <span className="font-mono text-[13px] text-ink hover:underline">{g.textos[0]}</span>
                {g.textos.length > 1 && (
                  <span className="block truncate text-[11px] text-faint">
                    y {g.textos.length - 1} grafía(s) más: {g.textos.slice(1).join(' · ')}
                  </span>
                )}
                <span className="mt-0.5 block truncate">
                  <Sugerido grupo={g} nombreDeObra={nombreDeObra} />
                </span>
              </Link>
            </Td>
            <Td className="w-[130px]">{g.tipos.map((t) => ETIQUETA_TIPO[t]).join(' · ')}</Td>
            <Td num className="w-[80px] text-muted">{g.cantidad}</Td>
            <Td num fuerte className="w-[150px]">
              {g.importe > 0 ? plata(g.importe) : <Nulo>sin importe</Nulo>}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Tabla>
  )
}
