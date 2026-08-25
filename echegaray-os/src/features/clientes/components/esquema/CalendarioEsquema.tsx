'use client'

// LA VISTA CALENDARIO DEL ESQUEMA (`32:293`–`32:345`).
//
//   cabecera  dos cuadrados de 30px, mes 14px/600, y la pista «Arrastre un pago para cambiarle la fecha»
//   tarjeta   blanca, borde `#E7E6E2`, radio 10, `overflow:hidden`
//   encabezado grilla de 7, `background:#FAFAF8`, rótulos 9,5px `LUN`…`DOM`
//   celda     `minHeight:104px; padding:8px`, filo derecho `#EFEEEA`; fin de semana y días de otro
//             mes en `#FAFAF8` con el número en `#C4C2BC`
//   hoy       `background:#FFFDF5` + `boxShadow:inset 0 0 0 2px #FDC900`
//   pago      radio 6, `borderLeft:3px` del color del estado, `padding:6px 8px`, `cursor:grab`
//
// ARRASTRAR UN PAGO ES CAMBIARLE LA FECHA DE COBRO, o sea la columna Q de la pestaña Cobranzas. Por
// eso el `drop` no es un adorno: dispara la misma escritura que el chip de fecha del listado, con
// la misma vuelta atrás si el servidor la rechaza. Y por eso NO se puede soltar sobre un pago ya
// cobrado ni arrastrarlo: esa fecha es un hecho del banco.

import { useState } from 'react'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { BotonIcono } from '../canon/Piezas'
import { montoM } from '../../services/cobranzaFormato'
import { estadoVigente, grillaDelMes, pagosDelDia } from '../../services/reglasEsquema'
import type { CambioPago } from '../../services/entradasCobranza'
import type { EstadoPago, PagoEsquema } from '../../types/cobranzas'

const DIAS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const PINTA: Record<EstadoPago, { fondo: string; filo: string; punteado?: boolean }> = {
  a_vencer: { fondo: C.cursoFondo, filo: C.curso },
  vencido: { fondo: C.negSuave, filo: C.neg },
  cobrado: { fondo: C.posFondo, filo: C.pos },
  retenido: { fondo: '#F2F1ED', filo: C.tenue },
  previsto: { fondo: C.tenueFondo, filo: C.tenue, punteado: true },
}

export function CalendarioEsquema({ pagos, hoy, elegido, onElegir, onCambiar }: {
  pagos: PagoEsquema[]
  hoy: string
  elegido: string | null
  onElegir: (id: string) => void
  onCambiar: (id: string, cambio: CambioPago) => void
}) {
  // Arranca en el mes del primer pago pendiente; si no hay ninguno, en el de hoy. Abrir siempre en
  // el mes corriente obligaría a navegar a mano hasta donde están los pagos.
  const [mes, setMes] = useState(() => {
    const proximo = pagos.find((p) => p.fecha && p.fecha >= hoy) ?? pagos.find((p) => p.fecha)
    const base = proximo?.fecha ?? hoy
    return { anio: Number(base.slice(0, 4)), mes: Number(base.slice(5, 7)) }
  })
  const [arrastrando, setArrastrando] = useState<string | null>(null)

  const mover = (delta: number) => setMes((m) => {
    const n = m.mes + delta
    if (n < 1) return { anio: m.anio - 1, mes: 12 }
    if (n > 12) return { anio: m.anio + 1, mes: 1 }
    return { anio: m.anio, mes: n }
  })

  const grilla = grillaDelMes(mes.anio, mes.mes)

  return (
    <div data-testid="calendario-esquema">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <BotonIcono titulo="Mes anterior" lado={30} onClick={() => mover(-1)} testid="mes-anterior">
          <Ico d={P.chevronIzq} s={15} w={2} />
        </BotonIcono>
        <div style={{ fontSize: '14px', fontWeight: 600, color: C.tinta }}>
          {MESES[mes.mes - 1]} {mes.anio}
        </div>
        <BotonIcono titulo="Mes siguiente" lado={30} onClick={() => mover(1)} testid="mes-siguiente">
          <Ico d={P.chevronDer} s={15} w={2} />
        </BotonIcono>
        <span style={{
          marginLeft: '12px', display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11.5px',
          color: C.tenue,
        }}>
          <Ico d={P.arrastrar} s={14} />
          Arrastre un pago para cambiarle la fecha
        </span>
      </div>

      <div style={{
        background: C.superficie, border: `1px solid ${C.borde}`, borderRadius: '10px',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: `1px solid ${C.borde}`,
          background: C.tenueFondo,
        }}>
          {DIAS.map((d) => (
            <div key={d} style={{
              fontSize: '9.5px', color: C.tenue, letterSpacing: '.05em', padding: '8px 10px',
            }}>{d}</div>
          ))}
        </div>

        {grilla.map((semana, f) => (
          <div key={semana[0].iso} style={{
            display: 'grid', gridTemplateColumns: 'repeat(7,1fr)',
            borderBottom: f === grilla.length - 1 ? undefined : `1px solid ${C.bordeFila}`,
          }}>
            {semana.map((dia, k) => {
              const esHoy = dia.iso === hoy
              const findeOFuera = k >= 5 || !dia.delMes
              const delDia = pagosDelDia(pagos, dia.iso)
              return (
                <div
                  key={dia.iso}
                  onDragOver={(e) => { if (arrastrando) e.preventDefault() }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const id = e.dataTransfer.getData('text/plain') || arrastrando
                    setArrastrando(null)
                    if (id) onCambiar(id, { fecha: dia.iso })
                  }}
                  data-testid={`dia-${dia.iso}`}
                  style={{
                    minHeight: '104px', padding: '8px',
                    borderRight: k === 6 ? undefined : `1px solid ${C.bordeFila}`,
                    background: esHoy ? C.marcaTenue : findeOFuera ? C.tenueFondo : undefined,
                    boxShadow: esHoy ? `inset 0 0 0 2px ${C.marca}` : undefined,
                  }}
                >
                  <div style={{
                    fontFamily: MONO, fontSize: '11.5px', fontWeight: esHoy ? 600 : 400,
                    color: esHoy ? C.tinta : dia.delMes ? C.tintaSuave : C.fantasmaFuerte,
                  }}>{Number(dia.iso.slice(8, 10))}</div>

                  {delDia.map((p) => {
                    const estado = estadoVigente(p, hoy)
                    const pinta = PINTA[estado]
                    const fijo = estado === 'cobrado'
                    return (
                      <div
                        key={p.id} role="button" tabIndex={0}
                        draggable={!fijo}
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', p.id); setArrastrando(p.id) }}
                        onDragEnd={() => setArrastrando(null)}
                        onClick={() => onElegir(p.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') onElegir(p.id) }}
                        data-testid={`pago-cal-${p.id}`}
                        title={fijo ? 'Cobrado: su fecha no se mueve' : 'Arrastrar para cambiar la fecha'}
                        style={{
                          marginTop: '6px', borderRadius: '6px', background: pinta.fondo,
                          border: pinta.punteado ? `1px dashed ${C.bordeFuerte}` : undefined,
                          borderLeft: `3px solid ${pinta.filo}`, padding: '6px 8px',
                          cursor: fijo ? 'default' : 'grab',
                          outline: elegido === p.id ? `2px solid ${C.marca}` : undefined,
                          opacity: arrastrando === p.id ? 0.5 : 1,
                        }}
                      >
                        <div style={{
                          fontFamily: MONO, fontSize: '12.5px', fontWeight: 600,
                          color: estado === 'previsto' ? C.tintaSuave : C.tinta,
                        }}>{montoM(p.monto)}</div>
                        <div style={{
                          fontSize: '10.5px', marginTop: '1px',
                          color: estado === 'previsto' ? C.tintaSuave : C.tintaMedia,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{p.concepto}</div>
                        {(p.cambio_pendiente || !p.visible_portal || p.reprogramaciones.length > 1) && (
                          <div style={{
                            fontSize: '10px', marginTop: '2px',
                            color: p.cambio_pendiente ? C.warn : !p.visible_portal ? C.tenue : C.neg,
                          }}>
                            {p.cambio_pendiente
                              ? 'sin publicar'
                              : !p.visible_portal
                                ? 'oculto'
                                : `${p.reprogramaciones.length}ª fecha`}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
