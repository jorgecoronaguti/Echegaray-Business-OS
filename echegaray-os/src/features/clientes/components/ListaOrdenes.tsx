'use client'

// LAS ÓRDENES DE UNA OBRA, DIBUJADAS — número · fecha · importe · descarga.
//
// Vive aparte del `PanelOrdenes` porque LO MISMO se mira desde dos lados: el panel de `/clientes`
// (que se abre desde el número de la fila) y la solapa Documentos de la ficha de la obra. Dibujar
// dos listas parecidas fue exactamente la trampa que este repo ya pagó: se parecen hasta que una de
// las dos aprende algo que la otra no. Una sola lista, dos lugares.
//
// EL IMPORTE PUEDE SER NULL Y SE DICE «sin importe»: el script sólo carga lo que el PDF dice. Un
// cero ahí sería una orden de compra por cero pesos, que es una afirmación falsa sobre un contrato.

import { V } from '@/shared/components/v2/patron'
import { pesos } from '@/shared/components/canon/formato'
import { numeroCorto, type OrdenDetallada } from '../services/ordenesCliente'

const TIPO: Record<string, string> = {
  orden_compra: 'Orden de compra', orden_pago: 'Orden de pago', factura: 'Factura', otro: 'Documento',
}

/**
 * EL TÍTULO DE UN PAPEL. Una factura nuestra NO se anuncia como «Orden de compra N° 2162» —ése es
 * el número de la orden que factura, no el suyo—: se anuncia como «Factura 225 · cita OC 2162».
 * Es evidencia de la obra, y la cita es justamente lo que la vuelve evidencia.
 */
export function tituloDeOrden(o: Pick<OrdenDetallada, 'tipo' | 'numero' | 'cita'>): string {
  const clase = TIPO[o.tipo] ?? o.tipo
  if (o.tipo !== 'factura') return `${clase} ${o.numero ? `N° ${o.numero}` : 'sin número'}`
  const cita = o.cita ? ` · cita OC ${o.cita.split('-').pop()}` : ''
  return `${clase} ${numeroCorto(o.numero) ?? 's/n'}${cita}`
}

export function ListaOrdenes({ ordenes, veEconomia }: {
  /** `null` = la lectura falló. «No pude leerlas» no se dibuja como «no hay ninguna». */
  ordenes: OrdenDetallada[] | null
  /** El campo y el jefe de obra no ven precios: el importe de la orden ES precio de venta. */
  veEconomia: boolean
}) {
  return (
    <>
      {ordenes === null && (
        <p style={{ fontSize: '12.5px', color: V.warn, padding: '4px 0' }}>
          No pude leer las órdenes. Esta pantalla no puede afirmar que no haya ninguna.
        </p>
      )}
      {ordenes?.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado, padding: '4px 0' }}>
          Ninguna orden bajada del mail para esta obra.
        </p>
      )}
      {(ordenes ?? []).map((o) => (
        <a
          key={o.id}
          href={`/api/clientes/orden/${o.id}`}
          target="_blank"
          rel="noreferrer"
          data-testid="orden-descargar"
          data-tipo={o.tipo}
          style={{ display: 'grid', gap: 2, padding: '9px 0', borderBottom: `1px solid ${V.lineaFila}` }}
        >
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: V.tinta }}>
              {tituloDeOrden(o)}
            </span>
            <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: V.tenue, marginLeft: 'auto' }}>
              {o.fecha ?? 'sin fecha'}
            </span>
          </span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="truncate" style={{ fontSize: '11.5px', color: V.apagado, minWidth: 0 }}>
              {o.nombre_archivo}
            </span>
            {veEconomia && (
              <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: V.tinta, marginLeft: 'auto', flexShrink: 0 }}>
                {o.importe === null ? 'sin importe' : `${o.moneda === 'USD' ? 'U$S ' : ''}${pesos(o.importe)}`}
              </span>
            )}
          </span>
          {/* CÓMO SE SUPO DE QUÉ CLIENTE ES. `texto` es una deducción del asunto del mail y se dice:
              un hecho y una inferencia no se pueden dibujar iguales. */}
          {o.atribucion !== 'remitente' && (
            <span style={{ fontSize: '11px', color: V.lupa }}>
              atribuido por {o.atribucion === 'texto' ? 'el texto del mail (deducido)' : 'una persona'}
            </span>
          )}
        </a>
      ))}
    </>
  )
}
