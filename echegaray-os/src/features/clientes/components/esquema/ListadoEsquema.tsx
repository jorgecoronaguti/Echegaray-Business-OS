'use client'

// EL LISTADO DEL ESQUEMA DE PAGO (`32:85`–`32:292`).
//
//   grilla  `112px minmax(0,1.5fr) 112px 104px 122px 132px 68px`, `gap:12px`, filas `minHeight:54px`
//   elegida `background:#FFFFFF` + `boxShadow:inset 3px 0 0 #FDC900`, y su chip de fecha corre 9px
//   total   fila de 48px sobre `#FAFAF8`
//   aviso   «Falta asignar …» en `#B54708`, 11,5px, debajo del total
//
// LOS DOS CONTROLES DE LA FILA ESCRIBEN DE VERDAD: el chip de fecha (que es la palanca del cobro,
// la columna Q de Cobranzas) y el interruptor de «lo ve el cliente». El lápiz abre el panel, que es
// donde vive el resto.

import { C, MONO, ROTULO_COL } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { BotonIcono, Interruptor, Vacio } from '../canon/Piezas'
import { CeldaEstado } from '../cuenta/estados'
import { FechaEnLaFila } from './FechaEnLaFila'
import { enMillones, montoM } from '../../services/cobranzaFormato'
import { cuadreDelContrato, estadoVigente, totalEsquema } from '../../services/reglasEsquema'
import type { CambioPago } from '../../services/entradasCobranza'
import type { PagoEsquema } from '../../types/cobranzas'

const COLS = '112px minmax(0,1.5fr) 112px 104px 122px 132px 68px'

export function ListadoEsquema({ pagos, contratoTotal, hoy, elegido, onElegir, onCambiar }: {
  pagos: PagoEsquema[]
  contratoTotal: number | null
  hoy: string
  elegido: string | null
  onElegir: (id: string) => void
  onCambiar: (id: string, cambio: CambioPago) => void
}) {
  const total = totalEsquema(pagos)
  const cuadre = cuadreDelContrato(contratoTotal, pagos)

  return (
    <div data-testid="listado-esquema">
      <div style={{
        display: 'grid', gridTemplateColumns: COLS, gap: '12px', alignItems: 'end', height: '30px',
        borderBottom: `1px solid ${C.borde}`,
      }}>
        <span style={ROTULO_COL}>FECHA</span>
        <span style={ROTULO_COL}>CONCEPTO</span>
        <span style={{ ...ROTULO_COL, textAlign: 'right' }}>MONTO</span>
        <span style={{ ...ROTULO_COL, textAlign: 'right' }}>REPARO</span>
        <span style={ROTULO_COL}>ESTADO</span>
        <span style={ROTULO_COL}>LO VE EL CLIENTE</span>
        <span style={{ paddingBottom: '7px' }} />
      </div>

      {pagos.map((p) => {
        const sel = elegido === p.id
        const estado = estadoVigente(p, hoy)
        const apagado = estado === 'cobrado' || estado === 'previsto'
        return (
          <div
            key={p.id} data-testid={`fila-pago-${p.id}`}
            style={{
              display: 'grid', gridTemplateColumns: COLS, gap: '12px', alignItems: 'center',
              minHeight: '54px', borderBottom: `1px solid ${C.bordeFila}`,
              background: sel ? C.superficie : undefined,
              boxShadow: sel ? `inset 3px 0 0 ${C.marca}` : undefined,
            }}
          >
            <div style={{ marginLeft: sel ? '9px' : undefined, minWidth: 0 }}>
              <FechaEnLaFila
                fecha={p.fecha}
                tono={sel ? 'elegido' : estado === 'previsto' ? 'previsto' : apagado ? 'apagado' : 'normal'}
                // UN COBRO YA REGISTRADO NO SE MUEVE DESDE ACÁ: su fecha es un hecho del banco, no
                // una fecha pactada. Corregirla es corregir el cobro, y eso se hace en la 28.
                deshabilitado={estado === 'cobrado'}
                onCambiar={(iso) => onCambiar(p.id, { fecha: iso })}
                testid={`fecha-${p.id}`}
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: '12.5px', fontWeight: sel ? 500 : 400,
                color: apagado ? C.tintaSuave : C.tinta,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{p.concepto}</div>
              <div style={{
                fontSize: '11px', marginTop: '1px',
                color: p.cambio_pendiente ? C.warn : estado === 'vencido' ? C.neg : C.tenue,
              }}>
                {p.cambio_pendiente ? 'cambio sin publicar' : (p.detalle ?? p.obra_nombre ?? '')}
              </div>
            </div>

            <span style={{
              fontFamily: MONO, fontSize: '12.5px', textAlign: 'right',
              color: apagado ? C.tintaSuave : C.tinta,
            }}>{montoM(p.monto)}</span>

            {p.reparo == null
              ? <span style={{ fontSize: '11.5px', color: C.fantasma, textAlign: 'right' }}>—</span>
              : <span style={{
                  fontFamily: MONO, fontSize: '11.5px', textAlign: 'right',
                  color: apagado ? C.tenue : C.tintaSuave,
                }}>{enMillones(p.reparo)}</span>}

            <CeldaEstado estado={estado} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Interruptor
                encendido={p.visible_portal}
                etiqueta={`Mostrar «${p.concepto}» en el portal del cliente`}
                onClick={() => onCambiar(p.id, { visible_portal: !p.visible_portal })}
                testid={`visible-${p.id}`}
              />
              <span style={{ fontSize: '11px', color: p.cambio_pendiente ? C.warn : C.tenue }}>
                {p.cambio_pendiente ? 'al publicar' : p.visible_portal ? 'visible' : 'oculto'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <BotonIcono titulo="Editar" lado={30} onClick={() => onElegir(p.id)} testid={`editar-${p.id}`}>
                <Ico d={P.lapiz} s={15} />
              </BotonIcono>
            </div>
          </div>
        )
      })}

      {pagos.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: COLS, gap: '12px', alignItems: 'center',
          height: '48px', background: C.tenueFondo, borderBottom: `1px solid ${C.bordeFila}`,
        }} data-testid="total-esquema">
          <span />
          <span style={{ fontSize: '12.5px', fontWeight: 600, color: C.tinta }}>Total del esquema</span>
          <span style={{
            fontFamily: MONO, fontSize: '12.5px', fontWeight: 600, color: C.tinta, textAlign: 'right',
          }}>{montoM(total.monto)}</span>
          <span style={{
            fontFamily: MONO, fontSize: '11.5px', color: C.tintaSuave, textAlign: 'right',
          }}>{total.reparo > 0 ? enMillones(total.reparo) : '—'}</span>
          <span /><span /><span />
        </div>
      )}

      {cuadre.estado === 'falta' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 0', fontSize: '11.5px',
          color: C.warn,
        }} data-testid="falta-asignar">
          <Ico d={P.alerta} s={14} w={2} />
          Falta asignar {montoM(cuadre.monto)} del contrato a un pago
        </div>
      )}
      {cuadre.estado === 'excede' && (
        // EL MOCKUP NO DIBUJA ESTE CASO porque su ejemplo no lo tiene. Se detecta igual: publicarle
        // al cliente un plan que suma más que lo contratado es peor que uno al que le falta.
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 0', fontSize: '11.5px',
          color: C.neg,
        }} data-testid="excede-contrato">
          <Ico d={P.alerta} s={14} w={2} />
          El esquema asigna {montoM(cuadre.monto)} MÁS que el contrato. Revisalo antes de publicar.
        </div>
      )}
      {cuadre.estado === 'sin_contrato' && pagos.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 0', fontSize: '11.5px',
          color: C.tenue,
        }} data-testid="sin-contrato">
          <Ico d={P.info} s={14} w={2} />
          Sin monto de contrato cargado no se puede decir cuánto falta asignar.
        </div>
      )}

      {pagos.length === 0 && (
        <Vacio testid="esquema-vacio">
          Este cliente todavía no tiene un esquema de pago. Se arma desde el contrato de la obra y
          desde las filas de la pestaña Cobranzas.
        </Vacio>
      )}
    </div>
  )
}
