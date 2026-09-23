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
import type { CSSProperties } from 'react'
import { C, MONO } from './canon/tokens'
import { useAnchoVentana } from './useAnchoVentana'
import { esAngosto } from '../services/anchoPantalla'
import { rotuloDeObra } from '@/shared/utils/obra'
import { bajadaGantt, esPrevio } from '../services/carteraCanon'
import {
  barrasDe, ESCALAS_CARTERA, FUERA_DE_VENTANA, LEYENDA_GANTT, LEYENDA_GANTT_TELEFONO, posicionEn,
  SIN_FECHAS_ESCRITORIO, SIN_FECHAS_TELEFONO, ventanaGantt, type EscalaCartera, type TonoGantt,
} from '../services/carteraGantt'
import { CabeceraCliente, type FilaCartera } from './CarteraObras'
import type { GrupoDeCliente } from '../services/carteraCanon'

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

/** Mes · Trimestre · Año (02): va en el encabezado fijo de la cartera cuando la vista es Gantt. */
export function SelectorEscala({ escala, setEscala }: { escala: EscalaCartera; setEscala: (e: EscalaCartera) => void }) {
  return (
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
  )
}

/**
 * EL CUERPO DEL GANTT DE LA CARTERA (02 / M02). Sin encabezado propio: título, buscador, Ver y chips
 * son los de `CarteraObras`, que no se vuelven a dibujar al pasar de Tabla a Gantt (dueño, 23/09/2026:
 * «cuando voy de tabla a gantt el diseño cambia, refresca, está mal»). El filtro también es el mismo.
 */
export function CuerpoGantt({ grupos, lista, total, hoyIso, telefono, escala }: {
  /** Los mismos grupos del CRM que dibuja la Tabla (dueño, 23/09/2026): cliente → obra → adicional. */
  grupos: GrupoDeCliente<FilaCartera>[]
  lista: FilaCartera[]
  total: number
  hoyIso: string
  telefono: boolean
  escala: EscalaCartera
}) {
  const router = useRouter()
  const ventana = ventanaGantt(hoyIso, telefono ? 'telefono' : escala)
  type Renglon = { tipo: 'cliente'; clave: string; nombre: string | null; slug: string | null; n: number } | { tipo: 'obra'; o: FilaCartera; nivel: 0 | 1 }
  const renglones: Renglon[] = grupos.flatMap((g) => [
    { tipo: 'cliente' as const, clave: g.clave, nombre: g.nombre, slug: g.slug, n: g.filas.length },
    ...g.filas.map((f) => ({ tipo: 'obra' as const, o: f.obra, nivel: f.nivel })),
  ])
  const ALTO_CLIENTE = telefono ? 40 : 36
  const xHoy = posicionEn(ventana, hoyIso)

  if (telefono) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }} data-testid="gantt-obras">
        <div style={{ fontSize: '12px', color: C.tintaSuave }} data-testid="bajada-gantt">{bajadaGantt(lista)}</div>
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '118px 1fr', gap: '10px', height: '28px', alignItems: 'center', borderBottom: `1px solid ${C.borde}` }}>
            <div />
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ventana.meses.length},1fr)`, fontFamily: MONO, fontSize: '10px', color: C.tenue, textTransform: 'uppercase' }}>
              {ventana.meses.map((m) => <span key={m.label}>{m.label}</span>)}
            </div>
          </div>
          {renglones.map((r, i) => {
            const ultima = i === renglones.length - 1
            if (r.tipo === 'cliente') {
              return (
                <div key={`c:${r.clave}`} style={{ display: 'grid', gridTemplateColumns: '118px 1fr', gap: '10px', alignItems: 'center', borderBottom: ultima ? undefined : `1px solid ${C.borde}` }}>
                  <div style={{ gridColumn: '1 / -1' }}><CabeceraCliente nombre={r.nombre} slug={r.slug} n={r.n} telefono /></div>
                </div>
              )
            }
            const o = r.o
            const b = barrasDe(o, ventana)
            return (
              <div key={o.obra_id} data-testid={`fila-obra-${o.obra_id}`} data-obra={o.obra_id} data-nivel={r.nivel} onClick={() => router.push(hrefDe(o.obra_id))}
                style={{ display: 'grid', gridTemplateColumns: '118px 1fr', gap: '10px', height: '44px', alignItems: 'center', borderBottom: ultima ? undefined : `1px solid ${C.borde}`, cursor: 'pointer' }}>
                <div style={{ fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: esPrevio(o) ? C.tintaSuave : C.tinta, paddingLeft: r.nivel ? '10px' : 0 }}>{r.nivel ? '└ ' : ''}{rotuloDeObra(o)}</div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} data-testid="gantt-obras">
      <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0,1fr)', border: `1px solid ${C.borde}`, borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ borderRight: `1px solid ${C.borde}` }} data-columna-fija>
          <div style={{
            height: `${ALTO_CABECERA}px`, display: 'flex', alignItems: 'center', padding: '0 14px', background: C.tenueFondo,
            borderBottom: `1px solid ${C.borde}`, fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase',
          }}>Obra</div>
          {renglones.map((r, i) => r.tipo === 'cliente' ? (
            <div key={`c:${r.clave}`} style={{ height: `${ALTO_CLIENTE}px`, display: 'flex', alignItems: 'center', padding: '0 14px', borderBottom: i === renglones.length - 1 ? undefined : `1px solid ${C.borde}` }}>
              <div style={{ width: '100%' }}><CabeceraCliente nombre={r.nombre} slug={r.slug} n={r.n} /></div>
            </div>
          ) : (
            <Link key={r.o.obra_id} href={hrefDe(r.o.obra_id)} prefetch={false} data-testid={`fila-obra-${r.o.obra_id}`} data-obra={r.o.obra_id} data-nivel={r.nivel}
              style={{
                height: `${ALTO_FILA}px`, display: 'flex', alignItems: 'center', padding: `0 14px 0 ${r.nivel ? 36 : 14}px`, fontSize: '13px', textDecoration: 'none',
                borderBottom: i === renglones.length - 1 ? undefined : `1px solid ${C.borde}`, color: esPrevio(r.o) ? C.tintaSuave : C.tinta,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{r.nivel ? <span style={{ color: C.tenue, marginRight: '6px' }}>└</span> : null}{rotuloDeObra(r.o)}</Link>
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
          {renglones.map((r, i) => {
            const borde = i === renglones.length - 1 ? undefined : `1px solid ${C.borde}`
            if (r.tipo === 'cliente') return <div key={`c:${r.clave}`} style={{ height: `${ALTO_CLIENTE}px`, borderBottom: borde, background: C.tenueFondo }} />
            const o = r.o
            const b = barrasDe(o, ventana)
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
          No hay línea base útil: el sellado copió el plan y da desvío 0 en las {total} obras. La proyección sale de{' '}
          <span style={{ fontFamily: MONO, fontSize: '12px' }}>forecast_fin</span>.
        </span>
      </div>
    </div>
  )
}
