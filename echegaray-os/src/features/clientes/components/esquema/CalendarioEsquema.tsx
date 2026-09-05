'use client'

// LA VISTA CALENDARIO DEL ESQUEMA — handoff CRM v4, «CRM · Lo que faltaba (…).dc.html:201`–`:226`.
//
//   cabecera  dos cuadrados de 30px, mes 14px/600, y la pista «Arrastre un pago para cambiarle la fecha»
//   tarjeta   blanca, borde `#E7E6E2`, radio 10, `overflow:hidden`
//   encabezado grilla de 7, `background:#FAFAF8`, rótulos 9,5px `LUN`…`DOM`
//   celda     `minHeight:104px; padding:8px`, filo derecho `#F1F0EC`; fin de semana y días de otro
//             mes en `#FAFAF8` con el número en `#C4C2BC`
//   hoy       SÓLO `boxShadow:inset 0 0 0 2px #FDC900`, sin fondo
//   pago      fondo BLANCO, `borderLeft:3px` del color del estado, hairline `#F1F0EC` en los otros
//             tres lados, `borderRadius:0 6px 6px 0`, `padding:6px 8px`, `cursor:grab`
//
// ═══ LAS TARJETAS DEJARON DE TENER FONDO DE COLOR (05/09/2026) ═══
//
// Se pintaban con el tinte del estado (`#EFF5FF`, `#FDE2DE`, `#F1F9F4`…). Con dos o tres pagos en
// una celda de 104px la grilla se volvía un mosaico, y el amarillo de «hoy» —que es lo único que
// el handoff pinta— dejaba de destacarse. La v4 deja el color en un filo de 3px sobre blanco: el
// estado se sigue leyendo y el mes vuelve a leerse como un mes.
//
// ARRASTRAR UN PAGO ES CAMBIARLE LA FECHA DE COBRO, o sea la columna Q de la pestaña Cobranzas. Por
// eso el `drop` no es un adorno: dispara la misma escritura que el chip de fecha del listado, con
// la misma vuelta atrás si el servidor la rechaza. Y por eso NO se puede soltar sobre un pago ya
// cobrado ni arrastrarlo: esa fecha es un hecho del banco.

import { useState } from 'react'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { BotonIcono } from '../canon/Piezas'
import { diaMesAnio, montoM } from '../../services/cobranzaFormato'
import { estadoVigente, grillaDelMes, marcaDelPago, pagosDelDia } from '../../services/reglasEsquema'
import type { CambioPago } from '../../services/entradasCobranza'
import type { EstadoPago, PagoEsquema } from '../../types/cobranzas'

const DIAS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** El filo de 3px de cada estado. `previsto` es el único punteado: todavía no hay certificado. */
const PINTA: Record<EstadoPago, { filo: string; punteado?: boolean }> = {
  a_vencer: { filo: C.curso },
  vencido: { filo: C.neg },
  cobrado: { filo: C.pos },
  retenido: { filo: C.tenue },
  previsto: { filo: C.tenue, punteado: true },
}

/** El tono de la marca de la tarjeta. El ámbar es «el cliente no está viendo esto y debería». */
const TONO_MARCA = { warn: C.warn, apagado: C.tenue, neg: C.neg } as const

export function CalendarioEsquema({ pagos, hoy, elegido, onElegir, onCambiar, aviso, onAviso }: {
  pagos: PagoEsquema[]
  hoy: string
  elegido: string | null
  onElegir: (id: string) => void
  onCambiar: (id: string, cambio: CambioPago) => void
  /** Lo que pasó con el último arrastre, al lado del mes. `null` = no se movió nada todavía. */
  aviso: string | null
  onAviso: (texto: string | null) => void
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
        {aviso && (
          <span
            data-testid="calendario-aviso"
            style={{ marginLeft: 'auto', fontSize: '11.5px', color: C.warn, textAlign: 'right' }}
          >
            {aviso}
          </span>
        )}
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

        {grilla.map((semana) => (
          <div key={semana[0].iso} style={{
            display: 'grid', gridTemplateColumns: 'repeat(7,1fr)',
            borderBottom: `1px solid ${C.bordeCelda}`,
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
                    if (!id) return
                    const movido = pagos.find((p) => p.id === id)
                    // SOLTARLO EN SU MISMO DÍA NO ES UN CAMBIO. Sin esto, cada arrastre fallido
                    // encolaba una fila en `cobranza_cambio` y sumaba una reprogramación al
                    // historial: la evidencia de «cuántas veces se movió» quedaba inflada por los
                    // errores de puntería.
                    if (!movido || movido.fecha === dia.iso) return
                    onCambiar(id, { fecha: dia.iso })
                    // LO QUE PASÓ, DICHO AL LADO DEL MES. Arrastrar NO escribe la fecha: encola el
                    // cambio a la columna Q y deja el pago sin publicar, así que el cliente sigue
                    // viendo la fecha vieja hasta que alguien publique. Callar eso es lo que hace
                    // que alguien dé por avisado a un cliente que no se enteró.
                    onAviso(`${movido.concepto} → ${diaMesAnio(dia.iso)} · encolado a la columna Q, sin publicar`)
                  }}
                  data-testid={`dia-${dia.iso}`}
                  style={{
                    minHeight: '104px', padding: '8px',
                    borderRight: `1px solid ${C.bordeCelda}`,
                    // HOY NO LLEVA FONDO: el recuadro amarillo es la marca, y un tinte detrás de
                    // tarjetas blancas convertía el día en una mancha.
                    background: esHoy ? undefined : findeOFuera ? C.tenueFondo : undefined,
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
                    const marca = marcaDelPago(p)
                    return (
                      <div
                        key={p.id} role="button" tabIndex={0}
                        draggable={!fijo}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', p.id)
                          setArrastrando(p.id)
                          onAviso(null)
                        }}
                        onDragEnd={() => setArrastrando(null)}
                        onClick={() => onElegir(p.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') onElegir(p.id) }}
                        data-testid={`pago-cal-${p.id}`}
                        title={fijo ? 'Cobrado: su fecha no se mueve' : 'Arrastrar para cambiar la fecha'}
                        style={{
                          marginTop: '6px', borderRadius: '0 6px 6px 0', background: C.superficie,
                          border: pinta.punteado
                            ? `1px dashed ${C.bordeFuerte}`
                            : `1px solid ${C.bordeCelda}`,
                          borderLeft: `3px solid ${pinta.filo}`, padding: '6px 8px',
                          cursor: fijo ? 'default' : 'grab',
                          outline: elegido === p.id ? `2px solid ${C.marca}` : undefined,
                          opacity: arrastrando === p.id ? 0.5 : 1,
                        }}
                      >
                        <div style={{
                          fontFamily: MONO, fontSize: '12.5px', fontWeight: 600, color: C.tinta,
                        }}>{montoM(p.monto)}</div>
                        <div style={{
                          fontSize: '10.5px', marginTop: '1px', color: C.tintaSuave,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{p.concepto}</div>
                        {/* TRES AUSENCIAS DISTINTAS, TRES FRASES DISTINTAS. La regla vive en
                            `marcaDelPago`, que se prueba sin React: la RLS del portal exige
                            `visible_portal` Y `publicado_at`, así que «nunca publicado», «sin
                            publicar» y «oculto al cliente» significan cosas opuestas. */}
                        {marca && (
                          <div
                            data-testid={`marca-${p.id}`}
                            style={{ fontSize: '10px', marginTop: '2px', color: TONO_MARCA[marca.tono] }}
                          >
                            {marca.texto}
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
