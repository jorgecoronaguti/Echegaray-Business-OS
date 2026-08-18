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
import type { NombrePendiente, NombreResuelto } from '../types'

export function TablaNombres({ pendientes, seleccionado, hrefDe }: {
  pendientes: NombrePendiente[]
  seleccionado?: string
  hrefDe: (nombreNorm: string) => string
}) {
  if (pendientes.length === 0) {
    return (
      <p data-testid="cola-vacia" className="px-3 py-6 text-[13px] text-muted">
        Todos los nombres de compras tienen proveedor. No hay nada que resolver.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table data-testid="cola-nombres" className="w-full min-w-[520px] text-left">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
            <th className="px-3 py-2 font-medium">Nombre en el Sheet</th>
            <th className="px-3 py-2 text-right font-medium">Comprob.</th>
            <th className="px-3 py-2 text-right font-medium">Importe</th>
            <th className="px-3 py-2 font-medium">Período</th>
          </tr>
        </thead>
        <tbody>
          {pendientes.map((n) => (
            <tr
              key={n.nombre_norm}
              data-testid="nombre-pendiente"
              className={`border-b border-line/60 last:border-0 hover:bg-surface-quiet ${n.nombre_norm === seleccionado ? 'bg-surface-quiet' : ''}`}
            >
              <td className="px-3 py-2">
                <Link href={hrefDe(n.nombre_norm)} data-testid="abrir-nombre" className="block min-w-0">
                  <span className="text-[13px] text-ink hover:underline">{n.nombre_origen}</span>
                </Link>
              </td>
              <td className="px-3 py-2 text-right text-[12px] tabular-nums text-muted">{n.comprobantes}</td>
              <td className="px-3 py-2 text-right text-[12px] tabular-nums text-ink">{plata(n.total)}</td>
              <td className="px-3 py-2 text-[11px] tabular-nums text-faint">
                {fecha(n.primera_fecha)} → {fecha(n.ultima_fecha)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    <section className="mt-5">
      <h2 className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wide text-faint">Resueltos a mano</h2>
      <div className="overflow-hidden rounded-xl border border-line bg-white" data-testid="cola-resueltos">
        {manuales.map((r) => (
          <div
            key={r.nombre_norm}
            data-testid="nombre-resuelto"
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line/60 px-3 py-2 last:border-0"
          >
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{r.nombre_norm}</span>
            <span className="text-[11px] text-faint">
              {r.estado === 'no_es_proveedor' ? 'no es un proveedor' : (r.proveedor_nombre ?? '—')}
            </span>
            <span className="text-[11px] tabular-nums text-faint">{r.comprobantes}</span>
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
