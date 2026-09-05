'use client'

// EL LISTADO DEL ESQUEMA DE PAGO — handoff CRM v4, «CRM · Clientes · una pantalla.dc.html:327»
// (cabecera) y `:804` (fila).
//
//   grilla   `30px minmax(190px,1.5fr) 110px 150px 70px 150px 28px`, `gap:28px`, `paddingLeft:16px`
//   columnas [señal] · HITO · PREVISTO · IMPORTE · % · ESTADO · [abrir]
//   cabecera 40px, rótulos 10,5px/600 `.06em`, filo inferior `#D7D5CF`
//   filas    `minHeight:68px`, separador `#F1F0EC`
//   elegida  `boxShadow: inset 2px 0 0 #FDC900` — el filo entra en los 16px de sangría, así que la
//            fila NO se corre respecto de su cabecera
//
// ═══ QUÉ CAMBIÓ DEL CONTRATO ANTERIOR ═══
//
// La grilla era `112px minmax(0,1.5fr) 112px 104px 122px 132px 68px` con FECHA · CONCEPTO · MONTO ·
// REPARO · ESTADO · LO VE EL CLIENTE · [lápiz]. Tres decisiones, medidas contra las 108 filas
// reales de `esquema_pago` el 05/09/2026:
//
//   · REPARO se fue: está en NULL en las 108 filas. Era una columna de 104px llena de guiones. El
//     fondo de reparo se sigue viendo donde importa —su propia fila del esquema y el panel del
//     certificado— y con su palabra, no con un guión.
//   · «LO VE EL CLIENTE» se fue como interruptor y volvió como PALABRA. El interruptor decía
//     visible/oculto: dos estados para una realidad de tres, porque la RLS del portal exige
//     `visible_portal` Y `publicado_at`. Ahora el renglón chico dice cuál de las tres es —«nunca
//     publicado» · «sin publicar» · «oculto al cliente»— con `marcaDelPago`, que es la misma regla
//     probada que usa el calendario. El interruptor sigue existiendo en el panel del pago.
//   · Entró la columna %: qué parte del esquema es este pago. Es la lectura que dice si el plan
//     carga el cobro al final, y no existía en ninguna pantalla.
//
// LA FECHA SIGUE SIENDO EL CONTROL QUE ESCRIBE: es la columna Q de Cobranzas y la palanca del
// cobro. Ocupa la columna PREVISTO del handoff, que es exactamente lo que esa columna nombra.

import type { CSSProperties } from 'react'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { BotonIcono, Vacio } from '../canon/Piezas'
import { CeldaEstado } from '../cuenta/estados'
import { FechaEnLaFila } from './FechaEnLaFila'
import { montoConMoneda, montoM } from '../../services/cobranzaFormato'
import {
  cuadreDelContrato, detalleDePago, estadoVigente, marcaDelPago, totalEsquema,
} from '../../services/reglasEsquema'
import type { CambioPago } from '../../services/entradasCobranza'
import type { PagoEsquema } from '../../types/cobranzas'

const COLS = '30px minmax(190px,1.5fr) 110px 150px 70px 150px 28px'

/** 30+190+110+150+70+150+28, seis `gap:28px` y la sangría de 16px. Debajo scrollea por dentro. */
const MIN_TABLA = 912

const ROTULO: CSSProperties = {
  fontSize: '10.5px', fontWeight: 600, color: C.tenue, letterSpacing: '.06em',
}

/** El tono de la marca de publicación, el mismo que usa la tarjeta del calendario. */
const TONO_MARCA = { warn: C.warn, apagado: C.tenue, neg: C.neg } as const

/**
 * LA SEÑAL DE LA PRIMERA COLUMNA (30px): tilde verde si ya se cobró, lápiz ámbar si hay un cambio
 * que el cliente todavía no vio, y nada más. Es la columna que el mockup dibuja como `icono`.
 */
function Senal({ pago, estado }: { pago: PagoEsquema; estado: PagoEsquema['estado'] }) {
  if (estado === 'cobrado') {
    return (
      <span style={{ display: 'flex', justifyContent: 'center', color: C.pos }} title="Cobrado">
        <Ico d={P.ok} s={15} w={2.2} />
      </span>
    )
  }
  if (pago.cambio_pendiente) {
    return (
      <span style={{ display: 'flex', justifyContent: 'center', color: C.warn }} title="Cambio sin publicar">
        <Ico d={P.lapiz} s={15} />
      </span>
    )
  }
  return <span />
}

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
      {/* La grilla del handoff son 912px de mínimo. Sin el envoltorio, a 390px el importe se
          montaría sobre el estado en vez de recortarse. */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: `${MIN_TABLA}px` }}>
          <div style={{
            display: 'grid', gridTemplateColumns: COLS, gap: '28px', height: '40px',
            alignItems: 'center', paddingLeft: '16px', borderBottom: `1px solid ${C.bordeFuerte}`,
          }}>
            <span />
            <span style={ROTULO}>HITO</span>
            <span style={ROTULO}>PREVISTO</span>
            <span style={{ ...ROTULO, textAlign: 'right' }}>IMPORTE</span>
            <span style={{ ...ROTULO, textAlign: 'right' }}>%</span>
            <span style={ROTULO}>ESTADO</span>
            <span />
          </div>

          {pagos.map((p) => {
            const sel = elegido === p.id
            const estado = estadoVigente(p, hoy)
            const marca = marcaDelPago(p)
            const detalle = detalleDePago(p) ?? p.obra_nombre ?? ''
            // EL PORCENTAJE ES SOBRE EL TOTAL QUE ESE TOTAL SUMA. Un pago en otra moneda queda
            // fuera del total en pesos, así que su parte no se puede calcular: dividirlo igual
            // daría un porcentaje inventado. Va «—», que es lo que se sabe.
            const enElTotal = (p.moneda ?? 'ARS') === 'ARS' && total.monto > 0
            const pct = enElTotal ? `${Math.round((p.monto / total.monto) * 100)}%` : '—'
            return (
              <div
                key={p.id} data-testid={`fila-pago-${p.id}`}
                style={{
                  display: 'grid', gridTemplateColumns: COLS, gap: '28px', alignItems: 'center',
                  minHeight: '68px', paddingLeft: '16px',
                  borderBottom: `1px solid ${C.bordeCelda}`,
                  background: p.cambio_pendiente ? C.tenueFondo : undefined,
                  boxShadow: sel ? `inset 2px 0 0 ${C.marca}` : undefined,
                }}
              >
                <Senal pago={p} estado={estado} />

                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: '13px', fontWeight: 500, color: C.tinta,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{p.concepto}</div>
                  {/* EL RENGLÓN CHICO DICE DOS COSAS DISTINTAS Y NO LAS MEZCLA: qué pasó con el
                      pago (cobrado, previsto, el medio) y qué está viendo el cliente. La segunda
                      va en su color: ámbar cuando el cliente NO ve lo que esta pantalla muestra. */}
                  <div style={{
                    fontSize: '11.5px', marginTop: '2px', color: C.tenue,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {detalle}
                    {marca && (
                      <span data-testid={`marca-fila-${p.id}`} style={{ color: TONO_MARCA[marca.tono] }}>
                        {detalle ? ' · ' : ''}{marca.texto}
                      </span>
                    )}
                  </div>
                </div>

                <FechaEnLaFila
                  fecha={p.fecha}
                  tono={sel ? 'elegido' : estado === 'previsto' ? 'previsto' : estado === 'cobrado' ? 'apagado' : 'normal'}
                  // UN COBRO YA REGISTRADO NO SE MUEVE DESDE ACÁ: su fecha es un hecho del banco,
                  // no una fecha pactada. Corregirla es corregir el cobro, y eso se hace en la
                  // cuenta corriente.
                  deshabilitado={estado === 'cobrado'}
                  onCambiar={(iso) => onCambiar(p.id, { fecha: iso })}
                  testid={`fecha-${p.id}`}
                />

                <span style={{
                  fontFamily: MONO, fontSize: '12.5px', textAlign: 'right', color: C.tinta,
                }}>{montoConMoneda(p.monto, p.moneda)}</span>

                <span
                  data-testid={`pct-${p.id}`}
                  style={{
                    fontFamily: MONO, fontSize: '12px', textAlign: 'right',
                    color: enElTotal ? C.tintaSuave : C.fantasma,
                  }}
                >{pct}</span>

                <CeldaEstado estado={estado} />

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
              display: 'grid', gridTemplateColumns: COLS, gap: '28px', alignItems: 'center',
              height: '48px', paddingLeft: '16px', background: C.tenueFondo,
              borderBottom: `1px solid ${C.bordeCelda}`,
            }} data-testid="total-esquema">
              <span />
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: C.tinta }}>Total del esquema</span>
              <span />
              <span style={{
                fontFamily: MONO, fontSize: '12.5px', fontWeight: 600, color: C.tinta,
                textAlign: 'right',
              }}>{montoM(total.monto)}</span>
              {/* LO QUE EL TOTAL NO ESTÁ CONTANDO SE DICE. Un total al que le falta una moneda y no
                  lo declara se lee como si estuvieran todos los pagos adentro. */}
              <span style={{
                fontSize: '11px', color: C.tenue, gridColumn: 'span 3', textAlign: 'right',
              }}>
                {total.sinSumar > 0
                  ? `${total.sinSumar === 1 ? '1 pago' : `${total.sinSumar} pagos`} en otra moneda, fuera del total`
                  : ''}
              </span>
            </div>
          )}
        </div>
      </div>

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
