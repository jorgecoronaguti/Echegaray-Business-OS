'use client'

// D05 · COMPROBANTE OBSERVADO — qué falta, quién lo tiene que traer, y nada más.
//
// Del diseño NO se construye «Imputar con clave débil» ni el campo «Proveedor»: los dos escriben la fila de
// Compras desde la web, y el dueño decidió (22/09/2026) que la fila la escribe sólo el worker. Lo que sí:
// qué falta (derivado de lo que se leyó), lo que ya se pidió y lo que contestó, y pedir el dato.

import Link from 'next/link'
import type { Comprobante, Entrega } from '../types'
import { ddmm, ddmmHora, pesos, queFalta, totalLeido } from '../logica/entregas'
import { urlEfectivo } from '../logica/url'
import { DescartarComprobante, ObservarComprobante } from './AccionesComprobante'
import { Cerrar, PANEL_CLASE } from './Piezas'
import { ANCHO_PANEL_OBSERVADO, V, botonClaroGrande, cajaConfirmar, panel, punto } from './estilo'

export function PanelObservado({ c, e, destino }: { c: Comprobante; e: Entrega; destino: string }) {
  const volver = urlEfectivo({ entrega: e.codigo })
  const total = totalLeido(c)
  const nombreCorto = e.persona.split(/\s+/).slice(-1)[0] ?? e.persona
  const fila = { minHeight: 46, display: 'flex', alignItems: 'center', gap: 12, fontSize: '13.5px' } as const
  const faltas = queFalta(c)
  return (
    <aside style={{ ...panel, width: ANCHO_PANEL_OBSERVADO, gap: 20 }} className={PANEL_CLASE} aria-label="Comprobante observado" data-testid="panel-observado">
      <Cerrar
        href={volver}
        antes={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={punto('warn')} />
            <span style={{ fontSize: '12.5px', color: V.warn, fontWeight: 500 }}>Observado</span>
          </div>
        )}
        titulo={`Ticket de ${total != null ? pesos(total) : 'importe sin leer'} del ${ddmm(c.enviado_en)}`}
        bajada={`${e.codigo} · ${e.persona} · ${destino}`}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: '13px', fontWeight: 600 }}>Qué falta</div>
        <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="que-falta">
          {faltas.map((f, i) => (
            <div key={f.texto} style={{ ...fila, borderBottom: i < faltas.length - 1 ? `1px solid ${V.lineaFila}` : undefined }}>
              <span style={punto(f.tono)} />
              <span>{f.texto}</span>
              <span style={{ marginLeft: 'auto', fontSize: '12px', color: V.apagado }}>{f.detalle}</span>
            </div>
          ))}
        </div>
        {faltas.some((f) => f.texto.includes('CUIT')) && (
          <div style={{ fontSize: '12px', color: V.apagado, lineHeight: 1.5 }}>
            Sin CUIT el comprobante entra igual, pero la clave queda declarada como débil: dos tickets del mismo lugar y el mismo día podrían no distinguirse.
          </div>
        )}
      </div>

      {(c.observacion || c.motivo) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '12.5px', color: V.tintaSuave, lineHeight: 1.5 }} data-testid="observado-pedido">
          {c.observacion && <div>Se pidió{c.observado_en ? ` el ${ddmmHora(c.observado_en)}` : ''}: {c.observacion}</div>}
          {!c.observacion && c.motivo && <div>El sistema dijo: {c.motivo}</div>}
          {c.respuesta && <div style={{ color: V.tinta }}>Contestó{c.respondido_en ? ` el ${ddmmHora(c.respondido_en)}` : ''}: {c.respuesta}</div>}
        </div>
      )}

      <div style={cajaConfirmar}>
        <div style={{ fontSize: '12.5px', fontWeight: 600 }}>Pedirle el dato a {nombreCorto}</div>
        <div style={{ fontSize: '12.5px', color: V.tintaSuave, lineHeight: 1.45 }}>
          El pedido queda escrito en el comprobante, con la foto. Lo contesta {nombreCorto} o Administración.
        </div>
        <ObservarComprobante id={c.id} persona={nombreCorto} abierto grande={false} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto', flexWrap: 'wrap' }}>
        <Link href={volver} scroll={false} prefetch={false} style={botonClaroGrande} data-testid="dejar-observado">Dejar observado</Link>
        <DescartarComprobante id={c.id} alTerminar={volver} />
      </div>
    </aside>
  )
}
