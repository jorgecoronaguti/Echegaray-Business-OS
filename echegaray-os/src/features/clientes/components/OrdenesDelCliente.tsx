// LAS ÓRDENES DE COMPRA Y DE PAGO DE UN CLIENTE, DENTRO DE SU FICHA (dueño, 11/09/2026).
//
// «OC bajo cada obra, OP bajo cada cliente: dejá las OC debajo de cada obra y mandá lo que es OC y
// OP dentro de cada uno de los clientes, en su sección». La lista de la cartera ya no tiene columnas
// de OC ni de OP: los TOTALES y las ÓRDENES DE PAGO viven acá, agrupadas por trabajo, cada una con
// su PDF. La OP no se imputa a un trabajo en Cobranzas —paga facturas, no obras—, así que el grupo
// «Sin trabajo asignado» es normal y no un defecto de carga.

import { pesos } from '@/shared/components/canon/formato'
import { V } from '@/shared/components/v2/patron'
import type { OrdenDetallada } from '../services/ordenesCliente'
import { ListaOrdenes } from './ListaOrdenes'

const SIN_TRABAJO = '__sin-trabajo__'

/** Cuenta e importe de un tipo dentro de un grupo: «3 OC · $ 12.100.000». Sin importe declarado
 *  en algún PDF, el total se marca parcial en vez de sumar un cero que sería una afirmación falsa. */
function resumen(ordenes: OrdenDetallada[], tipo: 'oc' | 'op', veEconomia: boolean): string | null {
  const del = ordenes.filter((o) => String(o.tipo).toLowerCase() === tipo)
  if (!del.length) return null
  const sigla = tipo.toUpperCase()
  if (!veEconomia) return `${del.length} ${sigla}`
  const conImporte = del.filter((o) => o.importe !== null)
  const total = conImporte.reduce((a, o) => a + Number(o.importe), 0)
  const parcial = conImporte.length !== del.length ? ' ·' : ''
  return `${del.length} ${sigla} · ${pesos(total)}${parcial}`
}

export function OrdenesDelCliente({ ordenes, nombreDeObra, veEconomia }: {
  /** `null` = la lectura falló. «No pude leerlas» no se dibuja como «no hay ninguna». */
  ordenes: OrdenDetallada[] | null
  nombreDeObra: Map<string, string>
  veEconomia: boolean
}) {
  if (ordenes === null) return <ListaOrdenes ordenes={null} veEconomia={veEconomia} />
  if (!ordenes.length) {
    return (
      <p data-testid="ordenes-cliente-vacio" style={{ fontSize: '12.5px', color: V.apagado, padding: '4px 0' }}>
        Ninguna orden de compra ni de pago bajada del mail para este cliente.
      </p>
    )
  }
  const grupos = new Map<string, OrdenDetallada[]>()
  for (const o of ordenes) {
    const clave = o.obra_id ?? SIN_TRABAJO
    grupos.set(clave, [...(grupos.get(clave) ?? []), o])
  }
  // Los trabajos con nombre primero, en el orden de la ficha; lo sin trabajo cierra la lista.
  const claves = [...grupos.keys()].sort((a, b) => {
    if (a === SIN_TRABAJO) return 1
    if (b === SIN_TRABAJO) return -1
    return (nombreDeObra.get(a) ?? a).localeCompare(nombreDeObra.get(b) ?? b, 'es')
  })
  return (
    <div className="flex flex-col gap-5" data-testid="ordenes-cliente">
      {claves.map((clave) => {
        const del = grupos.get(clave) ?? []
        const titulo = clave === SIN_TRABAJO ? 'Sin trabajo asignado' : (nombreDeObra.get(clave) ?? clave)
        const partes = [resumen(del, 'oc', veEconomia), resumen(del, 'op', veEconomia)].filter(Boolean)
        return (
          <section key={clave} data-testid="grupo-ordenes" data-obra={clave === SIN_TRABAJO ? undefined : clave}>
            <header className="flex items-baseline justify-between gap-3" style={{ marginBottom: 6 }}>
              <h3 className="truncate" style={{ fontSize: '12.5px', fontWeight: 600, color: V.tinta, margin: 0 }}>
                {titulo}
              </h3>
              <span className="font-mono tabular-nums whitespace-nowrap" style={{ fontSize: '11.5px', color: V.apagado }}>
                {partes.join('  ·  ')}
              </span>
            </header>
            <ListaOrdenes ordenes={del} veEconomia={veEconomia} />
          </section>
        )
      })}
    </div>
  )
}
