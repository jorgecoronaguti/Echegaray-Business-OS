'use client'

// EL PANEL DE LAS ÓRDENES DE UNA OBRA — lo que el chip «OC ·11» promete que hay adentro.
//
// ═══ POR QUÉ EL CHIP ES UN BOTÓN Y NO UN ENLACE ═══
//
// La fila de la obra ES un `<Link>` a la obra. Un `<a>` dentro de otro `<a>` es HTML inválido: el
// navegador desarma el anidado y la fila queda con zonas que navegan a cualquier lado. El chip
// abre el panel con un `<button>` que corta la propagación y empuja la URL a mano.
//
// EL PANEL VIVE EN LA URL (`?ordenes=<obra_id>` / `?ordenes=cliente:<id>`): se comparte por chat, se
// cierra con el botón de atrás y lo dibuja el SERVIDOR, que es quien puede leer `cliente_orden` con
// la RLS de quien mira. Este componente no lee nada: recibe la lista ya resuelta.
//
// EL IMPORTE PUEDE SER NULL Y SE DICE «sin importe»: el script sólo carga lo que el PDF dice. Un
// cero ahí sería una orden de compra por cero pesos, que es una afirmación falsa sobre un contrato.

import { useRouter } from 'next/navigation'
import { Drawer } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { pesos } from '@/shared/components/canon/formato'
import type { OrdenDetallada } from '../services/ordenesCliente'

const TIPO: Record<string, string> = {
  orden_compra: 'Orden de compra', orden_pago: 'Orden de pago', otro: 'Documento',
}

export function PanelOrdenes({
  titulo, ordenes, veEconomia, cerrarHref,
}: {
  titulo: string
  /** `null` = la lectura falló. «No pude leerlas» no se dibuja como «no hay ninguna». */
  ordenes: OrdenDetallada[] | null
  /** El campo y el jefe de obra no ven precios: el importe de la orden ES precio de venta. */
  veEconomia: boolean
  cerrarHref: string
}) {
  const router = useRouter()
  return (
    <Drawer
      titulo={titulo}
      subtitulo={ordenes === null ? 'no se pudieron leer' : `${ordenes.length} documento${ordenes.length === 1 ? '' : 's'} del cliente`}
      onCerrar={() => router.push(cerrarHref)}
      testid="panel-ordenes"
    >
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
          style={{
            display: 'grid', gap: 2, padding: '9px 0', borderBottom: `1px solid ${V.lineaFila}`,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: V.tinta }}>
              {TIPO[o.tipo] ?? o.tipo} {o.numero ? `N° ${o.numero}` : 'sin número'}
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
    </Drawer>
  )
}
