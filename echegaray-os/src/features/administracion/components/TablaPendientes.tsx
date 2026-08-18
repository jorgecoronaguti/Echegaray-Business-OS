// LA COLA DE IMPUTACIÓN — una fila por TEXTO, no por comprobante.
//
// El orden por defecto es por importe descendente, que es el pedido del dueño: *"lo que más plata
// mueve, primero"*. Herramientas, pedidos y movimientos no tienen importe —mueven un recurso, no
// pesos— y caen al fondo con la cantidad de filas como desempate. Poner 0 en vez de "—" los
// mezclaría con compras de $0 y haría creer que ese trabajo no vale nada.
//
// La columna «Sugerido» está casi siempre vacía, y eso NO es un defecto: significa que no hay
// evidencia. La alternativa —rellenarla con el nombre más parecido— es la que fabrica costo en la
// obra equivocada.

import Link from 'next/link'
import { plata } from '@/features/obras/components/formato'
import { ETIQUETA_TIPO, type GrupoPendiente } from '../services/imputacionService'

function Sugerido({ grupo, nombreDeObra }: {
  grupo: GrupoPendiente
  nombreDeObra: (obraId: string) => string
}) {
  if (!grupo.sugerencia) return <span className="text-[11px] text-faint">sin evidencia</span>
  return (
    <span
      data-testid="sugerencia"
      className={`text-[12px] ${grupo.sugerencia.preseleccionar ? 'text-ink' : 'text-muted'}`}
    >
      {nombreDeObra(grupo.sugerencia.obra_id)}
      {!grupo.sugerencia.preseleccionar && <span className="text-[11px] text-faint"> · a confirmar</span>}
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
      <p data-testid="pendientes-vacio" className="px-3 py-6 text-[13px] text-muted">
        No queda ningún texto sin clasificar en compras, pedidos, herramientas ni movimientos.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table data-testid="tabla-pendientes" className="w-full min-w-[560px] text-left">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
            <th className="px-3 py-2 font-medium">Texto sin clasificar</th>
            <th className="px-3 py-2 font-medium">Origen</th>
            <th className="px-3 py-2 text-right font-medium">Filas</th>
            <th className="px-3 py-2 text-right font-medium">Importe</th>
            <th className="px-3 py-2 font-medium">Sugerido</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => (
            <tr
              key={g.clave}
              data-testid="fila-pendiente"
              className={`border-b border-line/60 last:border-0 hover:bg-surface-quiet ${g.clave === seleccionada ? 'bg-surface-quiet' : ''}`}
            >
              <td className="px-3 py-2">
                <Link href={hrefDe(g.clave)} data-testid="abrir-pendiente" className="block min-w-0">
                  <span className="text-[13px] text-ink hover:underline">{g.textos[0]}</span>
                  {g.textos.length > 1 && (
                    <span className="block truncate text-[11px] text-faint">
                      y {g.textos.length - 1} grafía(s) más: {g.textos.slice(1).join(' · ')}
                    </span>
                  )}
                </Link>
              </td>
              <td className="px-3 py-2 text-[11px] text-muted">
                {g.tipos.map((t) => ETIQUETA_TIPO[t]).join(' · ')}
              </td>
              <td className="px-3 py-2 text-right text-[12px] tabular-nums text-muted">{g.cantidad}</td>
              <td className="px-3 py-2 text-right text-[12px] tabular-nums text-ink">
                {g.importe > 0 ? plata(g.importe) : <span className="text-faint">—</span>}
              </td>
              <td className="px-3 py-2">
                <Sugerido grupo={g} nombreDeObra={nombreDeObra} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
