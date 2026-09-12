// LAS ÓRDENES DE COMPRA Y DE PAGO DE UN CLIENTE, DENTRO DE SU FICHA (dueño, 11/09/2026).
//
// ═══ Y ACÁ ESTÁN LOS DOS TOTALES DEL CLIENTE (dueño, 11/09/2026 18:42) ═══
//
// «Esas columnas OC/OP quitarlas de TODO el CRM porque deben estar en la sección Órdenes, que tiene
// que ser órdenes de compra y de pago.» Se fueron de la tabla de trabajos y de las cifras del
// titular de la ficha; el pie de abajo es el único lugar del CRM donde se leen sumados.
//
// EL PIE SUMA LO QUE ESTA PANTALLA DIBUJA, con la MISMA función que los encabezados de cada grupo:
// si sumara de otra fuente —las cifras del titular salían de otra lectura de la misma tabla—, el
// total de abajo y los parciales de arriba podrían decir distinto sobre los mismos papeles.
//
// «OC bajo cada obra, OP bajo cada cliente: dejá las OC debajo de cada obra y mandá lo que es OC y
// OP dentro de cada uno de los clientes, en su sección». La lista de la cartera ya no tiene columnas
// de OC ni de OP: los TOTALES y las ÓRDENES DE PAGO viven acá, agrupadas por trabajo, cada una con
// su PDF. La OP no se imputa a un trabajo en Cobranzas —paga facturas, no obras—, así que el grupo
// «Sin trabajo asignado» es normal y no un defecto de carga.

import { pesos } from '@/shared/components/canon/formato'
import { V } from '@/shared/components/v2/patron'
import { resumenDeOrdenes, type OrdenDetallada } from '../services/ordenesCliente'
import { ListaOrdenes } from './ListaOrdenes'

const SIN_TRABAJO = '__sin-trabajo__'

/** El resumen de un grupo lo decide `services/ordenesCliente.ts`, donde se puede probar sin
 *  navegador: la comparación del tipo vivía acá contra `'oc'` y la base guarda `'orden_compra'`, así
 *  que estos rótulos salían VACÍOS y nadie lo vio (12/09/2026). La pantalla sólo elige el formato. */
const resumen = (ordenes: OrdenDetallada[], tipo: 'oc' | 'op', veEconomia: boolean) =>
  resumenDeOrdenes(ordenes, tipo, veEconomia, pesos)

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
      {/* EL TOTAL DEL CLIENTE VA ARRIBA, AUNQUE SE LLAME PIE: Messina tiene 53 órdenes en once
          grupos y al final quedaría a tres pantallas de scroll de la pregunta que lo trae hasta acá.
          Una sola línea, sin tarjeta, con la cuenta y el importe de cada tipo. «Parcial» (el `·` del
          final) cuando algún PDF no declara importe: sumar un cero ahí sería una orden de compra por
          cero pesos. */}
      <p
        data-testid="total-ordenes-cliente"
        className="flex items-baseline justify-end gap-4 font-mono tabular-nums"
        style={{ fontSize: '12px', color: V.tinta, borderBottom: `1px solid ${V.linea}`, paddingBottom: 8 }}
        title="Suma de TODAS las órdenes de este cliente, las de abajo. El importe es el total del PDF, con IVA: no se resta contra el contratado, que es neto."
      >
        <span>{resumen(ordenes, 'oc', veEconomia) ?? 'sin OC'}</span>
        <span>{resumen(ordenes, 'op', veEconomia) ?? 'sin OP'}</span>
      </p>

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
