'use client'

// ═══ 02 · CARTERA · GANTT — PORTE LITERAL DE `erp-obras/02.html` Y `M02.html` (dueño, 23/09/2026) ═══
//
// Una fila por obra de 46px; columna fija de 300px con «Obra»; el lienzo con los meses de la ventana
// («Mes · Trimestre · Año»); barra clara del plan, llena de lo ejecutado (azul, roja con atraso),
// rayada la proyección más allá del plan; la línea de HOY en el amarillo de la marca. La obra sin
// fechas lo dice con palabras: «sin fechas cargadas — no se dibuja una barra inventada».
//
// En el teléfono (M02): 118px de nombre + lienzo, filas de 44px con UNA barra por obra en el color
// del estado, «+N d» al lado, la pastilla «HOY» y la leyenda en una línea.
//
// LA GEOMETRÍA ES DE `services/carteraGantt.ts` (pura, probada): acá sólo se pinta. Y LOS DATOS SON
// LOS DE LA TABLA: mismas filas, mismos filtros, mismo `forecast_fin`. Dos dibujos del mismo plazo
// con dos reglas es la forma en que dos pantallas empiezan a contestar distinto sobre la misma obra.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type CSSProperties } from 'react'
import { C, MONO } from './canon/tokens'
import { useAnchoVentana } from './useAnchoVentana'
import { esAngosto } from '../services/anchoPantalla'
import { rotuloDeObra } from '@/shared/utils/obra'
import { bajadaGantt, esPrevio } from '../services/carteraCanon'
import {
  barrasDe, ESCALAS_CARTERA, FUERA_DE_VENTANA, LEYENDA_GANTT, LEYENDA_GANTT_TELEFONO, posicionEn,
  SIN_FECHAS_ESCRITORIO, SIN_FECHAS_TELEFONO, ventanaGantt, type EscalaCartera, type TonoGantt,
} from '../services/carteraGantt'
import { ChipsCartera, ConmutadorVista, useFiltroCartera, type FilaCartera } from './CarteraObras'

const ALTO_FILA = 46
const ALTO_CABECERA = 36

/** El color lleno de cada tono, en escritorio (azul en curso) y en el teléfono (grafito en plazo). */
const LLENO: Record<TonoGantt, string> = {
  curso: C.curso, warn: C.warn, neg: C.neg, pos: C.pos, plan: C.bordeFuerte,
}
const LLENO_TELEFONO: Record<TonoGantt, string> = { ...LLENO, curso: C.grafito }

/** LA BARRA RAYADA del diseño: `repeating-linear-gradient(45deg, ámbar, ámbar 3px, claro 3px, claro 6px)`.
 *  El tono claro se saca aclarando el mismo color con blanco: no hay un segundo hex. */
const rayado = (color: string): string =>
  `repeating-linear-gradient(45deg, ${color}, ${color} 3px, rgba(255,255,255,.4) 3px, rgba(255,255,255,.4) 6px), ${color}`

const hrefDe = (id: string) => `/obras/${id}?vista=cronograma`

export function GanttObras({ obras, hoyIso }: { obras: FilaCartera[]; hoyIso: string }) {
  const router = useRouter()
  const telefono = esAngosto(useAnchoVentana())
  const { filtro, setFiltro, lista, cuentas, sinImpedimentos } = useFiltroCartera(obras)
  const [escala, setEscala] = useState<EscalaCartera>('trimestre')
  const ventana = ventanaGantt(hoyIso, telefono ? 'telefono' : escala)
  const xHoy = posicionEn(ventana, hoyIso)

  if (telefono) {
    return (
      <div style={{ background: C.superficie, padding: '16px', display: 'flex', flexDirection: 'column', gap: '18px' }} data-testid="gantt-obras">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '19px', fontWeight: 600, color: C.tinta }}>Obras</div>
          <ConmutadorVista vista="gantt" telefono />
        </div>
        <ChipsCartera filtro={filtro} setFiltro={setFiltro} cuentas={cuentas} sinImpedimentos={sinImpedimentos} telefono
          claves={['todo', 'atraso', 'curso', 'problema', 'previo']} />
        <div style={{ fontSize: '12px', color: C.tintaSuave }} data-testid="bajada-gantt">{bajadaGantt(lista)}</div>
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '118px 1fr', gap: '10px', height: '28px', alignItems: 'center', borderBottom: `1px solid ${C.borde}` }}>
            <div />
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ventana.meses.length},1fr)`, fontFamily: MONO, fontSize: '10px', color: C.tenue, textTransform: 'uppercase' }}>
              {ventana.meses.map((m) => <span key={m.label}>{m.label}</span>)}
            </div>
          </div>
          {lista.map((o, i) => {
            const b = barrasDe(o, ventana)
            const ultima = i === lista.length - 1
            return (
              <div key={o.obra_id} data-testid={`fila-obra-${o.obra_id}`} data-obra={o.obra_id} onClick={() => router.push(hrefDe(o.obra_id))}
                style={{ display: 'grid', gridTemplateColumns: '118px 1fr', gap: '10px', height: '44px', alignItems: 'center', borderBottom: ultima ? undefined : `1px solid ${C.borde}`, cursor: 'pointer' }}>
                <div style={{ fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: esPrevio(o) ? C.tintaSuave : C.tinta }}>{rotuloDeObra(o)}</div>
                {b == null
                  ? <div style={{ fontSize: '11.5px', color: C.tenue, fontStyle: 'italic' }} data-testid="obra-sin-plan">{SIN_FECHAS_TELEFONO}</div>
                  : b.fueraDeVentana
                    ? <div style={{ fontSize: '11.5px', color: C.tenue, fontStyle: 'italic' }} data-nulo="">{FUERA_DE_VENTANA}</div>
                    : (
                      <div style={{ position: 'relative', height: '100%' }}>
                        <div data-testid="barra-obra" data-tono={b.tono} style={{
                          position: 'absolute', left: `${b.plan.left}%`, width: `${b.plan.width}%`, top: '15px', height: '14px',
                          borderRadius: '3px', background: LLENO_TELEFONO[b.tono],
                        }} />
                        {b.rotuloAtraso && (
                          <div style={{ position: 'absolute', left: `calc(${Math.min(88, b.plan.left + b.plan.width)}% + 6px)`, top: '14px', fontSize: '11px', color: LLENO[b.tono], whiteSpace: 'nowrap' }}>
                            {b.rotuloAtraso}
                          </div>
                        )}
                      </div>
                    )}
              </div>
            )
          })}
          {xHoy >= 0 && xHoy <= 100 && (
            <>
              <div data-testid="linea-hoy-obras" style={{ position: 'absolute', left: `calc(128px + (100% - 128px)*${xHoy / 100})`, top: 0, bottom: 0, width: '1px', background: C.marca }} />
              <div style={{
                position: 'absolute', left: `calc(128px + (100% - 128px)*${xHoy / 100} - 12px)`, top: '-2px', fontFamily: MONO,
                fontSize: '9.5px', color: C.grafito, background: C.marca, padding: '1px 4px', borderRadius: '3px',
              }}>HOY</div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: '14px', fontSize: '11.5px', color: C.tintaSuave, flexWrap: 'wrap' }}>
          {LEYENDA_GANTT_TELEFONO.map((t, i) => (
            <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '10px', height: '6px', borderRadius: '2px', background: [C.grafito, C.warn, C.neg][i] }} />{t}
            </span>
          ))}
        </div>
      </div>
    )
  }

  const celdaMes = (actual: boolean, ultimo: boolean): CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11.5px',
    color: actual ? C.tinta : C.tintaSuave, fontWeight: actual ? 500 : 400,
    borderRight: ultimo ? undefined : `1px solid ${C.borde}`,
  })

  return (
    <div style={{ background: C.superficie, padding: '26px 30px 34px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }} data-testid="gantt-obras">
      <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
        <div style={{ fontSize: '19px', fontWeight: 600, letterSpacing: '-.01em', color: C.tinta }}>Obras</div>
        <ConmutadorVista vista="gantt" telefono={false} />
        <div style={{ width: '1px', height: '15px', background: C.borde }} />
        <ChipsCartera filtro={filtro} setFiltro={setFiltro} cuentas={cuentas} sinImpedimentos={sinImpedimentos} telefono={false}
          claves={['todo', 'curso', 'atraso', 'problema']} />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12.5px', color: C.tintaSuave }}>
          {ESCALAS_CARTERA.map((e) => {
            const activa = escala === e.k
            return (
              <button key={e.k} type="button" onClick={() => setEscala(e.k)} aria-pressed={activa} data-testid={`escala-${e.k}`}
                style={{
                  border: 'none', background: 'none', padding: 0, paddingBottom: '2px', cursor: 'pointer', font: 'inherit', fontFamily: 'inherit',
                  fontSize: '12.5px', color: activa ? C.tinta : C.tintaSuave, fontWeight: activa ? 500 : 400,
                  boxShadow: activa ? `inset 0 -1.5px 0 ${C.tinta}` : undefined,
                }}>{e.t}</button>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0,1fr)', border: `1px solid ${C.borde}`, borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ borderRight: `1px solid ${C.borde}` }} data-columna-fija>
          <div style={{
            height: `${ALTO_CABECERA}px`, display: 'flex', alignItems: 'center', padding: '0 14px', background: C.tenueFondo,
            borderBottom: `1px solid ${C.borde}`, fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase',
          }}>Obra</div>
          {lista.map((o, i) => (
            <Link key={o.obra_id} href={hrefDe(o.obra_id)} prefetch={false} data-testid={`fila-obra-${o.obra_id}`} data-obra={o.obra_id}
              style={{
                height: `${ALTO_FILA}px`, display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: '13px', textDecoration: 'none',
                borderBottom: i === lista.length - 1 ? undefined : `1px solid ${C.borde}`, color: esPrevio(o) ? C.tintaSuave : C.tinta,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{rotuloDeObra(o)}</Link>
          ))}
          {lista.length === 0 && <div style={{ height: `${ALTO_FILA}px`, display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: '12.5px', color: C.tintaSuave }}>Nada coincide.</div>}
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ height: `${ALTO_CABECERA}px`, display: 'grid', gridTemplateColumns: `repeat(${ventana.meses.length},1fr)`, background: C.tenueFondo, borderBottom: `1px solid ${C.borde}` }}>
            {ventana.meses.map((m, i) => <div key={m.label} style={celdaMes(m.actual, i === ventana.meses.length - 1)}>{m.label}</div>)}
          </div>
          {xHoy >= 0 && xHoy <= 100 && (
            <div data-testid="linea-hoy-obras" style={{ position: 'absolute', left: `${xHoy}%`, top: `${ALTO_CABECERA}px`, bottom: 0, width: '1px', background: C.marca }} />
          )}
          {lista.map((o, i) => {
            const b = barrasDe(o, ventana)
            const borde = i === lista.length - 1 ? undefined : `1px solid ${C.borde}`
            if (b == null || b.fueraDeVentana) {
              return (
                <div key={o.obra_id} style={{ height: `${ALTO_FILA}px`, position: 'relative', borderBottom: borde, display: 'flex', alignItems: 'center', paddingLeft: '16px', fontSize: '12.5px', color: C.tenue }}
                  data-testid={b == null ? 'obra-sin-plan' : undefined} data-nulo="">
                  {b == null ? SIN_FECHAS_ESCRITORIO : FUERA_DE_VENTANA}
                </div>
              )
            }
            const tramo = (t: { left: number; width: number }, fondo: string): CSSProperties => ({
              position: 'absolute', left: `${t.left}%`, top: '17px', width: `${t.width}%`, height: '12px', borderRadius: '3px', background: fondo,
            })
            return (
              <div key={o.obra_id} onClick={() => router.push(hrefDe(o.obra_id))} style={{ height: `${ALTO_FILA}px`, position: 'relative', borderBottom: borde, cursor: 'pointer' }}>
                <div style={tramo(b.plan, LLENO.plan)} data-testid="barra-plan" />
                {b.ejecutado && b.ejecutado.width > 0 && <div style={tramo(b.ejecutado, LLENO[b.tono])} data-testid="barra-obra" data-tono={b.tono} />}
                {b.proyeccion && b.proyeccion.width > 0 && <div style={tramo(b.proyeccion, rayado(LLENO[b.tono]))} data-testid="barra-proyeccion" />}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '26px', fontSize: '12.5px', color: C.tintaSuave }} data-testid="leyenda-gantt">
        {LEYENDA_GANTT.map((t, i) => (
          <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ width: '22px', height: '8px', borderRadius: '2px', background: [C.bordeFuerte, C.curso, rayado(C.warn)][i] }} />{t}
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }}>
          No hay línea base útil: el sellado copió el plan y da desvío 0 en las {obras.length} obras. La proyección sale de{' '}
          <span style={{ fontFamily: MONO, fontSize: '12px' }}>forecast_fin</span>.
        </span>
      </div>
    </div>
  )
}
