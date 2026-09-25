'use client'

// ═══ 02 · CARTERA · GANTT — PORTE LITERAL DE `erp-obras/02.html` Y `M02.html` (dueño, 23/09/2026) ═══
//
// Una fila por obra de 64px con la columna «Obra» de la Tabla (dueño, 24/09/2026); columna fija de 360px (el adicional con sangría entra entero); el lienzo con los meses de la ventana
// («Mes · Trimestre · Año»); barra clara del plan, llena de lo ejecutado (azul, roja con atraso),
// rayada la proyección más allá del plan; la línea de HOY en el amarillo de la marca. La obra sin
// fechas lo dice con palabras: «sin fechas cargadas — no se dibuja una barra inventada».
//
// En el teléfono (M02): 118px de nombre (el de M01) + lienzo, filas de 62px con UNA barra por obra en el color
// del estado, «+N d» al lado, la pastilla «HOY» y la leyenda en una línea.
//
// LA GEOMETRÍA ES DE `services/carteraGantt.ts` (pura, probada): acá sólo se pinta. Y LOS DATOS SON
// LOS DE LA TABLA: mismas filas, mismos filtros, mismo `forecast_fin`. Dos dibujos del mismo plazo
// con dos reglas es la forma en que dos pantallas empiezan a contestar distinto sobre la misma obra.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CSSProperties } from 'react'
import { C, MONO } from './canon/tokens'
import { bajadaGantt } from '../services/carteraCanon'
import {
  barrasDe, ESCALAS_CARTERA, FUERA_DE_VENTANA, LEYENDA_GANTT, LEYENDA_GANTT_TELEFONO, posicionEn,
  nombreCortoGantt, SIN_FECHAS_ESCRITORIO, SIN_FECHAS_TELEFONO, ventanaGantt, type EscalaCartera, type TonoGantt,
} from '../services/carteraGantt'
import { CabeceraCliente, type FilaCartera } from './CarteraObras'
import { estadoDeCartera, SIN_CLIENTE } from '../services/carteraCanon'
import { rotuloDeObra } from '@/shared/utils/obra'
import { Hover } from './canon/Piezas'
import type { GrupoDeCliente } from '../services/carteraCanon'

// LAS MEDIDAS SON LAS DE LA TABLA (01): encabezado de 40px, fila de 64px, 22px entre columnas. El
// Gantt no tiene alto propio: si la Tabla cambia, se cambia acá también.
// 02 (25/09, fidelidad): tarjeta con borde `#E7E6E2` y radio 8; columna de nombres de 300px con
// divisor vertical; encabezado de 36px en `#FAFAF8`; filas de 46 + 1 de línea, UNA línea de 13px.
const ALTO_FILA = 46
const ALTO_FILA_TELEFONO = 62
const ALTO_CABECERA = 36
const ANCHO_OBRA = 300
const GAP = 0
const COLS = `${ANCHO_OBRA}px minmax(0,1fr)`
/** Como `MIN_TABLA`: por debajo el lienzo scrollea por dentro y la página no se corre de costado. */
const MIN_GANTT = 660

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
  const xHoy = posicionEn(ventana, hoyIso)

  if (telefono) {
    // LA COLUMNA FIJA ES LA DEL M01 (dueño, 24/09/2026): cliente con `CabeceraCliente`, obra con
    // `NombreTelefono` (14px/500 + «Etapa · atraso») en filas de 62px. Cada renglón lleva nombre y
    // barra en la misma grilla: el alto de los dos lados no puede despegarse.
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }} data-testid="gantt-obras">
        <div style={{ fontSize: '12px', color: C.tintaSuave }} data-testid="bajada-gantt">{bajadaGantt(lista)}</div>
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '10px', height: '28px', alignItems: 'center', borderBottom: `1px solid ${C.borde}` }}>
            <div />
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ventana.meses.length},1fr)`, fontFamily: MONO, fontSize: '10px', color: C.tenue, textTransform: 'uppercase' }}>
              {ventana.meses.map((m) => <span key={m.label}>{m.label}</span>)}
            </div>
          </div>
          {renglones.map((r, i) => {
            if (r.tipo === 'cliente') return <CabeceraCliente key={`c:${r.clave}`} nombre={r.nombre} slug={r.slug} n={r.n} telefono />
            // Como la Tabla: la última obra del grupo no lleva línea (la pone la cabecera siguiente).
            const ultima = i === renglones.length - 1 || renglones[i + 1].tipo === 'cliente'
            const o = r.o
            const b = barrasDe(o, ventana)
            return (
              <div key={o.obra_id} data-testid={`fila-obra-${o.obra_id}`} data-obra={o.obra_id} data-nivel={r.nivel} onClick={() => router.push(hrefDe(o.obra_id))}
                role="link" tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter') router.push(hrefDe(o.obra_id)) }}
                style={{
                  display: 'grid', gridTemplateColumns: '130px 1fr', gap: '10px', height: `${ALTO_FILA_TELEFONO}px`, alignItems: 'center',
                  borderBottom: ultima ? undefined : `1px solid ${C.borde}`, fontSize: '13px', color: C.tinta, cursor: 'pointer',
                }}>
                {/* M02: el nombre SE LEE (dueño 25/09: «OB-0020 · ME - …» no dice nada): sin código ni prefijo
                    del cliente, en hasta dos renglones; el código completo queda en el título. */}
                <div title={`${o.codigo ? `${o.codigo} · ` : ''}${o.nombre}`} data-testid="nombre-gantt-telefono" style={{
                  minWidth: 0, paddingLeft: r.nivel ? '12px' : 0, lineHeight: 1.25, overflow: 'hidden',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word',
                }}>{nombreCortoGantt(o.nombre)}</div>
                {b == null
                  ? <div style={{ fontSize: '11.5px', color: C.tenue, fontStyle: 'italic' }} data-testid="obra-sin-plan">{SIN_FECHAS_TELEFONO}</div>
                  : b.fueraDeVentana
                    ? <div style={{ fontSize: '11.5px', color: C.tenue, fontStyle: 'italic' }} data-nulo="">{FUERA_DE_VENTANA}</div>
                    : (
                      <div style={{ position: 'relative', height: '100%' }}>
                        <div data-testid="barra-obra" data-tono={b.tono} style={{
                          position: 'absolute', left: `${b.plan.left}%`, width: `${b.plan.width}%`, top: `${(ALTO_FILA_TELEFONO - 14) / 2}px`, height: '14px',
                          borderRadius: '3px', background: LLENO_TELEFONO[b.tono],
                        }} />
                        {b.rotuloAtraso && (
                          <div style={{ position: 'absolute', left: `calc(${Math.min(88, b.plan.left + b.plan.width)}% + 6px)`, top: `${(ALTO_FILA_TELEFONO - 16) / 2}px`, fontSize: '11px', color: LLENO[b.tono], whiteSpace: 'nowrap' }}>
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
              <div data-testid="linea-hoy-obras" style={{ position: 'absolute', left: `calc(140px + (100% - 140px)*${xHoy / 100})`, top: 0, bottom: 0, width: '1px', background: C.marca }} />
              <div style={{
                position: 'absolute', left: `calc(140px + (100% - 140px)*${xHoy / 100} - 12px)`, top: '-2px', fontFamily: MONO,
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

  // 02: «Jul» en Plex Sans 11,5 #6B6B67 capitalizado; el mes actual 500 en tinta.
  const celdaMes = (actual: boolean, ultimo: boolean): CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11.5px',
    color: actual ? C.tinta : C.tintaSuave, fontWeight: actual ? 500 : 400,
    borderRight: ultimo ? undefined : `1px solid ${C.borde}`,
  })
  const mesCorto = (m: string) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()
  const tramo = (t: { left: number; width: number }, fondo: string): CSSProperties => ({
    position: 'absolute', left: `${t.left}%`, top: `${(ALTO_FILA - 12) / 2}px`, width: `${t.width}%`, height: '12px', borderRadius: '3px', background: fondo,
  })

  // 02 · PORTE LITERAL (fidelidad 25/09): tarjeta con borde y radio 8, columna de 300 con divisor
  // vertical, encabezado de 36 en `#FAFAF8`, filas de 46 en UNA línea de 13px. El agrupamiento por
  // cliente sigue (dueño 23/09): el cliente es un renglón de la tarjeta, de borde a borde.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} data-testid="gantt-obras">
      <div style={{ overflowX: 'auto' }}><div style={{ position: 'relative', display: 'flex', flexDirection: 'column', minWidth: `${MIN_GANTT}px`, border: `1px solid ${C.borde}`, borderRadius: '8px', overflow: 'hidden' }} data-testid="tarjeta-gantt">
        <div style={{
          display: 'grid', gridTemplateColumns: COLS, height: `${ALTO_CABECERA}px`, alignItems: 'stretch',
          borderBottom: `1px solid ${C.borde}`, background: C.tenueFondo,
        }} data-columna-fija>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', borderRight: `1px solid ${C.borde}`, fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase' }}>Obra</div>
          <div style={{ height: '100%', display: 'grid', gridTemplateColumns: `repeat(${ventana.meses.length},1fr)` }}>
            {ventana.meses.map((m, i) => <div key={m.label} style={celdaMes(m.actual, i === ventana.meses.length - 1)}>{mesCorto(m.label)}</div>)}
          </div>
        </div>
        {renglones.map((r, idx) => {
          const ultimaFila = idx === renglones.length - 1
          if (r.tipo === 'cliente') {
            // El cliente, de borde a borde de la tarjeta (el mismo renglón gris de la Tabla, con 14 de aire).
            return (
              <div key={`c:${r.clave}`} data-testid="cabecera-cliente" data-cliente={r.slug ?? ''} style={{
                display: 'flex', alignItems: 'center', gap: '10px', minHeight: '36px', padding: '0 14px', background: C.tenueFondo,
                borderBottom: `1px solid ${C.borde}`, fontSize: '11.5px', fontWeight: 600, letterSpacing: '.02em', color: r.nombre ? C.tinta : C.tenue,
              }}>
                {r.slug && r.nombre
                  ? <Link href={`/clientes/${r.slug}`} prefetch={false} onClick={(ev) => ev.stopPropagation()} style={{ color: C.tinta, textDecoration: 'none' }}>{r.nombre}</Link>
                  : <span>{r.nombre ?? SIN_CLIENTE}</span>}
                <span style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 400, color: C.tenue }}>{r.n}</span>
              </div>
            )
          }
          const o = r.o
          const b = barrasDe(o, ventana)
          const e = estadoDeCartera(o)
          return (
            <Hover key={o.obra_id} data-testid={`fila-obra-${o.obra_id}`} data-obra={o.obra_id} data-nivel={r.nivel} onClick={() => router.push(hrefDe(o.obra_id))}
              base={{
                display: 'grid', gridTemplateColumns: COLS, height: `${ALTO_FILA + (ultimaFila ? 0 : 1)}px`, alignItems: 'stretch',
                borderBottom: ultimaFila ? undefined : `1px solid ${C.borde}`, fontSize: '13px', cursor: 'pointer', color: C.tinta,
              }}
              hover={{ background: C.tenueFondo }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, padding: `0 14px 0 ${14 + (r.nivel ? 16 : 0)}px`, borderRight: `1px solid ${C.borde}`, lineHeight: 1.25 }}>
                {r.nivel ? <span style={{ color: C.tenue }}>└</span> : null}
                <Link href={hrefDe(o.obra_id)} prefetch={false} onClick={(ev) => ev.stopPropagation()} title={`${rotuloDeObra(o)} · ${e.t}`}
                  style={{ color: C.tinta, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{rotuloDeObra(o)}</Link>
              </div>
              {b == null || b.fueraDeVentana
                ? (
                  <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: '12.5px', color: C.tenue }} data-testid={b == null ? 'obra-sin-plan' : undefined} data-nulo="">
                    {b == null ? SIN_FECHAS_ESCRITORIO : FUERA_DE_VENTANA}
                  </div>
                )
                : (
                  <div style={{ position: 'relative' }}>
                    <div style={tramo(b.plan, LLENO.plan)} data-testid="barra-plan" />
                    {b.ejecutado && b.ejecutado.width > 0 && <div style={tramo(b.ejecutado, LLENO[b.tono])} data-testid="barra-obra" data-tono={b.tono} />}
                    {b.proyeccion && b.proyeccion.width > 0 && <div style={tramo(b.proyeccion, rayado(LLENO[b.tono]))} data-testid="barra-proyeccion" />}
                  </div>
                )}
            </Hover>
          )
        })}
        {lista.length === 0 && <div style={{ padding: '26px 14px', fontSize: '12.5px', color: C.tintaSuave }}>Nada coincide.</div>}
        {xHoy >= 0 && xHoy <= 100 && (
          <div data-testid="linea-hoy-obras" style={{
            position: 'absolute', left: `calc(${ANCHO_OBRA}px + (100% - ${ANCHO_OBRA}px)*${xHoy / 100})`,
            top: `${ALTO_CABECERA}px`, bottom: 0, width: '1px', background: C.marca, pointerEvents: 'none',
          }} />
        )}
      </div></div>

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
