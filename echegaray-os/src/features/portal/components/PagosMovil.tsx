'use client'

import { useState } from 'react'
import { diaMes } from '@/shared/components/canon'
import type { CertificadoPortal, ContratoPortal } from '../types'
import { barraContrato } from '../reglas/contrato'
import { estadoEnPantalla, type ClaveEstado } from '../reglas/estado'
import { grillaDelMes, mesVecino, nombreDelMes } from '../reglas/calendario'
import { soloFecha } from '../reglas/aPagar'
import { P } from '../estilos'
import { millonesCorto, millonesPortal } from '../formato'
import { VacioPortal } from './piezas'
import { IcoAnterior, IcoCalendario, IcoListado, IcoSiguiente } from './iconos'

// «ESQUEMA DE PAGO» EN EL TELÉFONO — `30`, líneas 82–219.
//
// El índice visual lo dice: «ve el esquema de pago propuesto y sus comprobantes · NO PAGA DESDE
// ACÁ». Por eso esta pantalla no tiene el botón Pagar ni el aviso de transferencia del `29`: son
// para lo que se hace sentado. Acá se mira cuándo hay que pagar y cuánto.
//
// ═══ TRES TRAMOS, NO CUATRO ═══
//
// El `29` separa el fondo de reparo; el `30` lo mete adentro de «Por venir» (16 % / 28 % / 56 %, y
// 0,64 + 14,26 = 14,90 — la cuenta cierra exacta contra el mockup). En 350px de ancho un tramo de
// 3 % es una raya de 10px que no se puede tocar ni leer.
//
// ═══ EL CALENDARIO NO INVENTA FECHAS ═══
//
// Un certificado sin vencimiento no aparece en ningún día: aparece en la lista, abajo, con «a
// convenir». Ponerle un punto a un día que nadie pactó sería fabricar una fecha de pago.

type Vista = 'calendario' | 'listado'

const PUNTO: Record<ClaveEstado, { color: string; hueco: boolean }> = {
  a_vencer: { color: P.info, hueco: false },
  vencido: { color: P.neg, hueco: false },
  pagado: { color: P.pos, hueco: false },
  para_aprobar: { color: P.tenue, hueco: true },
  en_revision: { color: P.warn, hueco: false },
  sin_fecha: { color: P.tenue, hueco: true },
}

function Punto({ clave, s = 6 }: { clave: ClaveEstado; s?: number }) {
  const t = PUNTO[clave]
  return (
    <span style={{
      width: s, height: s, borderRadius: s / 2, flexShrink: 0,
      background: t.hueco ? P.superficie : t.color,
      border: t.hueco ? `1px solid ${t.color}` : undefined,
    }} />
  )
}

function Resumen({ contrato, pagos }: { contrato: ContratoPortal; pagos: number }) {
  const barra = barraContrato(contrato)
  if (!barra) return <VacioPortal texto="Todavía no está cargado el monto del contrato." />

  const t = (clave: string) => barra.tramos.find((x) => x.clave === clave)!
  const porVenir = t('reparo').monto + t('falta').monto
  const tramos = [
    { rotulo: 'Pagado', monto: t('cobrado').monto, pct: t('cobrado').pct, fondo: P.verdeSuave, borde: P.pos },
    { rotulo: 'A pagar', monto: t('sin_cobrar').monto, pct: t('sin_cobrar').pct, fondo: P.rojoSuave, borde: P.neg },
    { rotulo: 'Por venir', monto: porVenir, pct: t('reparo').pct + t('falta').pct, fondo: P.avatar, borde: P.lineaFuerte },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
        <span style={{
          fontFamily: "'IBM Plex Mono',monospace", fontSize: '24px', fontWeight: 600,
          color: P.tinta, letterSpacing: '-.02em',
        }}>
          {millonesPortal(contrato.monto)}
        </span>
        <span style={{ fontSize: '12px', color: P.apagado }}>
          contrato{pagos > 0 && ` · ${pagos} pago${pagos === 1 ? '' : 's'}`}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 2, marginTop: 10, height: 20, borderRadius: 4, overflow: 'hidden' }}>
        {tramos.filter((x) => x.pct > 0).map((x) => (
          <div key={x.rotulo} title={`${x.rotulo} ${millonesPortal(x.monto)}`}
            style={{ width: `${x.pct}%`, background: x.fondo }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        {tramos.map((x) => (
          <div key={x.rotulo} style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{
              width: 7, height: 7, borderRadius: 2, background: x.fondo,
              border: `1px solid ${x.borde}`, flexShrink: 0,
            }} />
            <div>
              <div style={{ fontSize: '10.5px', color: P.tintaSuave }}>{x.rotulo}</div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', color: P.tenue }}>
                {millonesCorto(x.monto)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const botonMes: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 6, border: `1px solid ${P.linea}`, background: P.superficie,
  display: 'flex', alignItems: 'center', justifyContent: 'center', color: P.apagado,
  cursor: 'pointer', flexShrink: 0,
}

export function PagosMovil({ contrato, certificados, hoy }: {
  contrato: ContratoPortal
  certificados: CertificadoPortal[]
  hoy: string
}) {
  const [ancla, setAncla] = useState(() => ({ anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) }))
  const [vista, setVista] = useState<Vista>('calendario')

  const conFecha = certificados
    .map((c) => ({ c, dia: soloFecha(c.vence), e: estadoEnPantalla(c, hoy) }))
    .filter((x) => x.dia !== null)
  const delMes = conFecha
    .filter((x) => x.dia!.slice(0, 7) === `${ancla.anio}-${String(ancla.mes).padStart(2, '0')}`)
    .sort((a, b) => a.dia!.localeCompare(b.dia!))
  const sinFecha = certificados.filter((c) => soloFecha(c.vence) === null)

  const grilla = grillaDelMes(ancla.anio, ancla.mes)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
      <Resumen contrato={contrato} pagos={certificados.length} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" title="Mes anterior" style={botonMes}
          onClick={() => setAncla((a) => mesVecino(a.anio, a.mes, -1))}>
          <IcoAnterior />
        </button>
        <div style={{ fontSize: '14px', fontWeight: 600, color: P.tinta }}>
          {nombreDelMes(ancla.anio, ancla.mes)}
        </div>
        <button type="button" title="Mes siguiente" style={botonMes}
          onClick={() => setAncla((a) => mesVecino(a.anio, a.mes, 1))}>
          <IcoSiguiente />
        </button>

        <div style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'stretch', border: `1px solid ${P.linea}`,
          borderRadius: 7, overflow: 'hidden', background: P.superficie,
        }}>
          {([['calendario', <IcoCalendario key="c" />], ['listado', <IcoListado key="l" />]] as const).map(([v, ico]) => (
            <button
              key={v}
              type="button"
              title={v === 'calendario' ? 'Calendario' : 'Listado'}
              onClick={() => setVista(v)}
              style={{
                width: 38, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: vista === v ? P.seleccion : 'transparent',
                color: vista === v ? P.tinta : P.tenue,
                borderLeft: v === 'listado' ? `1px solid ${P.linea}` : undefined,
                border: 'none', cursor: 'pointer',
              }}
            >
              {ico}
            </button>
          ))}
        </div>
      </div>

      {vista === 'calendario' && (
        <div style={{
          background: P.superficie, border: `1px solid ${P.linea}`, borderRadius: 10, overflow: 'hidden',
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: P.superficieTenue,
            borderBottom: `1px solid ${P.lineaBloque}`,
          }}>
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
              <div key={`${d}${i}`} style={{ fontSize: '9px', color: P.tenue, textAlign: 'center', padding: '6px 0' }}>
                {d}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', textAlign: 'center' }}>
            {grilla.map((d) => {
              const delDia = conFecha.filter((x) => x.dia === d.fecha)
              const esHoy = d.fecha === hoy
              return (
                <div key={d.fecha} style={{
                  height: 40, paddingTop: 8,
                  background: esHoy ? '#FFFDF5' : undefined,
                  boxShadow: esHoy ? `inset 0 0 0 2px ${P.marca}` : undefined,
                }}>
                  <span style={{
                    fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px',
                    fontWeight: delDia.length > 0 ? 600 : 400,
                    color: !d.del_mes || d.finde ? P.apagadoIcono : delDia.length > 0 ? P.tinta : P.tintaSuave,
                  }}>
                    {d.dia}
                  </span>
                  {delDia.length > 0 && (
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 3 }}>
                      {delDia.slice(0, 3).map((x) => <Punto key={x.c.id} clave={x.e.clave} />)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div>
        {delMes.length === 0 && sinFecha.length === 0 ? (
          <VacioPortal texto="No hay pagos previstos en este mes." />
        ) : (
          [...delMes, ...sinFecha.map((c) => ({ c, dia: null, e: estadoEnPantalla(c, hoy) }))]
            .map((x, i, todos) => (
              <div key={x.c.id} style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', minHeight: 54,
                borderTop: i === 0 ? `1px solid ${P.linea}` : undefined,
                borderBottom: i === todos.length - 1 ? undefined : `1px solid ${P.lineaBloque}`,
              }}>
                <span style={{
                  fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px', color: P.apagado,
                  width: 36, flexShrink: 0,
                }}>
                  {x.dia ? diaMes(x.dia) : '—'}
                </span>
                <Punto clave={x.e.clave} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '13px', color: x.e.clave === 'pagado' ? P.apagado : P.tinta }}>
                    {x.c.numero}
                  </div>
                  <div style={{
                    fontSize: '11.5px', marginTop: 1,
                    color: x.e.clave === 'vencido' ? P.neg : x.e.clave === 'pagado' ? P.pos : P.tenue,
                  }}>
                    {x.e.rotulo.toLowerCase()}{x.e.nota && x.e.clave !== 'pagado' ? ` · ${x.e.nota}` : ''}
                  </div>
                </div>
                <span style={{
                  fontFamily: "'IBM Plex Mono',monospace", fontSize: '13.5px', flexShrink: 0,
                  color: x.e.clave === 'pagado' ? P.apagado : P.tinta,
                }}>
                  {millonesPortal(x.c.monto)}
                </span>
              </div>
            ))
        )}
      </div>
    </div>
  )
}
