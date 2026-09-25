'use client'

// ═══ 08b · DOTACIÓN Y PROYECCIÓN — PORTE LITERAL DE `erp-obras/08b.html` Y `M11.html` (dueño, 23/09/2026) ═══
//
// «Preguntar: Con esta gente, ¿cuándo termino? · Para terminar tal día, ¿cuánta gente?». La tabla de
// frentes —Frente · HH restantes · Dotación (stepper − N +) · Días técnicos · Termina— con «sin
// base» donde no hay HH del análisis (la fila al 45 %); el aside de 380px con el fin proyectado
// (28px, ámbar si cae después del plan), los límites reales y el botón grafito «Aplicar al plan»;
// debajo, los plegables «Plan · Real · Proyección por rubro» y «Capacidad ponderada» en filas de
// 44px. En el teléfono (M11): pastillas de pregunta, filas de 64px con stepper de 40px, fin
// proyectado de 24px y la primaria amarilla «Aplicar al plan» de 48px al pie.
//
// LA CUENTA CORRE EN EL NAVEGADOR con la misma función pura que corre el servidor (`simularFrente`,
// `dotacionParaDuracion`): el stepper no navega. La URL sigue siendo la memoria del simulador
// (`?dot=<frente>~<n>`, sincronizada con `replaceState`). Los días hábiles y el índice del fin de
// plan vienen resueltos del servidor: el navegador NO tiene el calendario de la obra.
//
// NULL NUNCA ES 0: un frente sin HH del análisis dice «sin base», no 0 días; una fecha que ninguna
// dotación alcanza dice «no alcanza», no una dotación inventada.

import { startTransition, useActionState, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { AccionFormulario, ResultadoAccion } from '@/shared/components/ui'
import {
  bajadaFinProyectado, diasHastaFecha, finProyectadoDe, noLaborablesProximos, simularFrente, sublineaFrente,
  sublineaFrenteTelefono, textoDiasTecnicos, TOPE_DOTACION, type Frente,
} from '../services/dotacion'
import { dotacionParaDuracion } from '../services/simulacionFrente'
import { C, MONO } from './canon/tokens'
import { Ico, P } from './canon/Ico'
import { useAnchoVentana } from './useAnchoVentana'
import { esAngosto } from '../services/anchoPantalla'

export interface Props {
  obraId: string
  frentes: Frente[]
  /** Las dotaciones que venían en la URL. Sólo ésas se escriben al aplicar. */
  dotIniciales: Record<string, number>
  jornada: number
  /** Los días hábiles de la obra desde el arranque de la simulación, resueltos por el servidor. */
  habiles: string[]
  /** El índice de día hábil del fin de plan. Negativo si el plan ya venció. `null` sin plan. */
  idxFinPlan: number | null
  finPlan: string | null
  /** El primer día hábil desde el que se simula (ISO). */
  desde: string
  /** Los no laborables de la obra (ISO), para «No laborables». */
  noLaborables: string[]
  /** Cuánta gente hay de verdad en la obra. `null` cuando no se pudo leer. */
  disponibles: number | null
  capacidad: { nombre: string; factor: number }[]
  /** La tabla «Plan · Real · Proyección por rubro», dibujada por el servidor. */
  rubros: ReactNode
  nRubros: number
  puedeAplicar: boolean
  aplicar: AccionFormulario
}

type Pregunta = 'cuando' | 'cuanta'
const PREGUNTAS: { k: Pregunta; t: string; corta: string }[] = [
  { k: 'cuando', t: 'Con esta gente, ¿cuándo termino?', corta: '¿Cuándo termino?' },
  { k: 'cuanta', t: 'Para terminar tal día, ¿cuánta gente?', corta: '¿Cuánta gente?' },
]

const GRID = 'minmax(0,1fr) 120px 150px 118px 120px'
const MIN_TABLA = 780
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const n0 = (v: number) => Math.round(v).toLocaleString('es-AR')
const EYEBROW: CSSProperties = { fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase' }

interface FilaSim {
  f: Frente
  /** La dotación puesta (modo «cuándo») o la necesaria (modo «cuánta»). `null` = no alcanza. */
  dotacion: number | null
  dias: number | null
  fin: string | null
  sinBase: boolean
  noAlcanza: boolean
}

export function SimuladorDotacion({
  obraId, frentes, dotIniciales, jornada, habiles, idxFinPlan, finPlan, desde, noLaborables, disponibles,
  capacidad, rubros, nRubros, puedeAplicar, aplicar,
}: Props) {
  const telefono = esAngosto(useAnchoVentana())
  const [pregunta, setPregunta] = useState<Pregunta>('cuando')
  const [dot, setDot] = useState<Record<string, number>>(dotIniciales)
  const [fechaObjetivo, setFechaObjetivo] = useState<string>(finPlan ?? habiles[habiles.length - 1] ?? desde)
  const [abierto, setAbierto] = useState<{ rubros: boolean; capacidad: boolean }>({ rubros: false, capacidad: false })

  const sincronizarUrl = (siguiente: Record<string, number>) => {
    const p = new URLSearchParams(window.location.search)
    p.delete('dot')
    for (const [k, v] of Object.entries(siguiente)) p.append('dot', `${k}~${v}`)
    const q = p.toString()
    window.history.replaceState(null, '', `/obras/${obraId}/dotacion${q ? `?${q}` : ''}`)
  }
  const mover = (f: Frente, v: number) => {
    // El tope lo recorta `simularFrente`, no este handler: la pantalla y el servidor recortan en el
    // MISMO lugar o el número que se ve no es el que se guarda.
    const techo = Math.max(TOPE_DOTACION, dot[f.clave] ?? f.dotacion)
    const siguiente = { ...dot, [f.clave]: Math.max(0, Math.min(techo, v)) }
    setDot(siguiente); sincronizarUrl(siguiente)
  }

  const filas: FilaSim[] = useMemo(() => frentes.map((f) => {
    const sinBase = f.hhRestantes == null
    if (pregunta === 'cuanta') {
      const dias = diasHastaFecha(habiles, fechaObjetivo)
      const necesaria = sinBase || dias == null ? null : dotacionParaDuracion(f.hhRestantes, dias, jornada, f.diasTecnicos)
      const noAlcanza = !sinBase && (necesaria == null || (f.tope != null && necesaria > f.tope))
      return { f, dotacion: noAlcanza ? null : necesaria, dias, fin: dias == null ? null : fechaObjetivo, sinBase, noAlcanza }
    }
    const sim = simularFrente(f, dot[f.clave] ?? f.dotacion, jornada, habiles)
    return { f, dotacion: sim.dotacion, dias: sim.dias, fin: sim.fin, sinBase, noAlcanza: false }
  }), [frentes, dot, pregunta, fechaObjetivo, jornada, habiles])

  const fin = useMemo(
    () => finProyectadoDe(filas.map((x) => ({ nombre: x.f.nombre, dias: x.sinBase ? null : x.dias })), idxFinPlan, habiles),
    [filas, idxFinPlan, habiles],
  )
  const manda = frentes.find((f) => f.nombre === fin.manda) ?? null
  const aEscribir = Object.entries(dot).filter(([, v]) => v > 0)
  const termina = (x: FilaSim): { texto: string; color: string; italica: boolean; despues: boolean } => {
    if (x.sinBase) return { texto: 'sin base', color: C.tenue, italica: true, despues: false }
    if (x.noAlcanza) return { texto: 'no alcanza', color: C.neg, italica: false, despues: false }
    if (!x.fin) return { texto: x.dias === 0 ? 'terminado' : 'sin plan', color: C.tenue, italica: true, despues: false }
    const despues = idxFinPlan != null && x.dias != null && (x.dias - 1) > idxFinPlan
    return { texto: ddmm(x.fin), color: despues ? C.warn : C.tinta, italica: false, despues }
  }

  const stepper = (x: FilaSim, tam: number) => {
    const inactivo = x.sinBase || pregunta === 'cuanta'
    const caja: CSSProperties = {
      width: `${tam}px`, height: `${tam}px`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', color: C.tintaSuave, background: 'none',
      cursor: inactivo ? 'default' : 'pointer', padding: 0, font: 'inherit',
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: tam >= 40 ? '6px' : '8px', opacity: x.sinBase ? .45 : 1 }} data-testid={`dotacion-${x.f.clave}`}>
        <button type="button" style={caja} disabled={inactivo} onClick={() => mover(x.f, (x.dotacion ?? 0) - 1)} aria-label="Una persona menos"><Ico d={P.menos} s={tam >= 40 ? 13 : 12} /></button>
        <span style={{ width: '22px', textAlign: 'center', fontWeight: 500, fontSize: tam >= 40 ? '15px' : undefined, color: x.noAlcanza ? C.neg : C.tinta, fontVariantNumeric: 'tabular-nums' }}>
          {x.noAlcanza ? '—' : x.dotacion ?? '—'}
        </span>
        <button type="button" style={caja} disabled={inactivo} onClick={() => mover(x.f, (x.dotacion ?? 0) + 1)} aria-label="Una persona más"><Ico d={P.mas} s={tam >= 40 ? 13 : 12} /></button>
      </div>
    )
  }

  // LOS LÍMITES REALES con los números de esta obra. La capacidad ponderada de la dotación del
  // frente que manda necesita las categorías de las personas asignadas, que esta pantalla no lee:
  // se dice «sin categorías cargadas», no se inventa un 3,2.
  const limites: { k: string; t: string; texto: string | null; falta: string; sufijo?: string }[] = [
    { k: 'tope', t: 'Tope por frente', texto: manda?.tope != null ? `${manda.tope} personas` : null, falta: 'sin declarar' },
    { k: 'disponibles', t: 'Disponibles hoy', texto: disponibles != null ? String(disponibles) : null, falta: 'sin dato' },
    { k: 'capacidad', t: `Capacidad de ${fin.manda ? (filas.find((x) => x.f.nombre === fin.manda)?.dotacion ?? '—') : '—'}`, texto: null, falta: 'sin categorías cargadas', sufijo: 'ponderada' },
    { k: 'no-laborables', t: 'No laborables', texto: noLaborablesProximos(noLaborables, desde), falta: 'ninguno cargado' },
  ]

  const finBloque = (tam: number) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tam === 24 ? '3px' : '5px' }} data-testid="fin-proyectado">
      <div style={EYEBROW}>{tam === 24 ? 'Fin proyectado' : 'Fin proyectado con esta dotación'}</div>
      <div style={{ fontSize: `${tam}px`, fontWeight: 600, letterSpacing: '-.02em', color: fin.fecha == null ? C.tenue : fin.despues ? C.warn : C.tinta, fontVariantNumeric: 'tabular-nums' }}>
        {fin.fecha ?? <span style={{ fontSize: '14px', fontStyle: 'italic', fontWeight: 400 }} data-nulo="">sin base</span>}
      </div>
      <div style={{ fontSize: tam === 24 ? '12px' : '12.5px', color: C.tintaSuave }}>{bajadaFinProyectado(fin, finPlan, tam === 24)}</div>
    </div>
  )

  const fechaInput = pregunta === 'cuanta' && (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: C.tintaSuave }}>
      Terminar el
      <input type="date" value={fechaObjetivo} min={habiles[0]} max={habiles[habiles.length - 1]} onChange={(e) => setFechaObjetivo(e.target.value)}
        data-testid="fecha-objetivo"
        style={{ height: telefono ? '44px' : '34px', padding: '0 11px', border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', fontSize: '13px', fontFamily: MONO, color: C.tinta, background: C.superficie }} />
    </label>
  )

  if (telefono) {
    return (
      <div style={{ padding: '16px', paddingBottom: '96px', display: 'flex', flexDirection: 'column', gap: '14px', background: C.superficie }} data-testid="simulador-dotacion">
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginRight: '-16px', paddingRight: '16px', scrollbarWidth: 'none' }}>
          {PREGUNTAS.map((q) => {
            const activa = pregunta === q.k
            return (
              <button key={q.k} type="button" onClick={() => setPregunta(q.k)} aria-pressed={activa} data-testid={`pregunta-${q.k}`} style={{
                font: 'inherit', height: '44px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexShrink: 0,
                border: `1px solid ${activa ? C.grafito : C.borde}`, borderRadius: '6px', fontSize: '12.5px', fontWeight: activa ? 500 : 400,
                color: activa ? C.tinta : C.tintaSuave, background: C.superficie, cursor: 'pointer', fontFamily: 'inherit',
              }}>{q.corta}</button>
            )
          })}
        </div>
        {fechaInput}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filas.map((x) => {
            const sub = sublineaFrenteTelefono(x.f)
            const t = termina(x)
            return (
              <div key={x.f.clave} data-testid={`frente-${x.f.clave}`} style={{ minHeight: '64px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: `1px solid ${C.borde}`, opacity: x.sinBase ? .55 : 1 }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: C.tinta }}>{x.f.nombre}</div>
                  <div style={{ fontSize: '12px', color: C.tintaSuave }}>{sub.texto}{sub.sinBase && <span style={{ color: C.warn }}>sin HH del análisis</span>}</div>
                </div>
                {stepper(x, 44)}
                {/* minWidth y no width: «terminado» en mono itálica mide 68 y con width 44 desbordaba la pantalla (402 > 390). */}
                <span style={{ fontFamily: MONO, fontSize: '12.5px', color: t.color, minWidth: '44px', flexShrink: 0, whiteSpace: 'nowrap', textAlign: 'right', fontStyle: t.italica ? 'italic' : undefined }}>{t.texto}</span>
              </div>
            )
          })}
        </div>
        {finBloque(24)}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={EYEBROW}>Límites reales</div>
          {limites.slice(0, 2).map((l, i) => (
            <div key={l.k} style={{ minHeight: '40px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: i === 0 ? `1px solid ${C.borde}` : undefined, fontSize: '14px', color: C.tinta }}>
              <div style={{ flex: 1, minWidth: 0 }}>{l.t}</div>
              <div style={{ flexShrink: 0, textAlign: 'right', color: l.texto ? C.tinta : C.tenue, fontStyle: l.texto ? undefined : 'italic' }}>{l.texto ?? l.falta}</div>
            </div>
          ))}
        </div>
        <Aplicar dot={aEscribir} puedeAplicar={puedeAplicar} aplicar={aplicar} telefono />
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 30px 32px', display: 'flex', flexDirection: 'column', gap: '28px', background: C.superficie }} data-testid="simulador-dotacion">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: '52px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '22px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span style={{ fontSize: '12px', color: C.tenue }}>Preguntar</span>
              {PREGUNTAS.map((q) => {
                const activa = pregunta === q.k
                return (
                  <button key={q.k} type="button" onClick={() => setPregunta(q.k)} aria-pressed={activa} data-testid={`pregunta-${q.k}`} style={{
                    border: 'none', background: 'none', padding: 0, paddingBottom: '2px', cursor: 'pointer', font: 'inherit', fontFamily: 'inherit', fontSize: '12.5px',
                    color: activa ? C.tinta : C.tintaSuave, fontWeight: activa ? 500 : 400, boxShadow: activa ? `inset 0 -1.5px 0 ${C.tinta}` : undefined,
                  }}>{q.t}</button>
                )
              })}
            </div>
            <div style={{ width: '1px', height: '15px', background: C.borde }} />
            <span style={{ fontSize: '12.5px', color: C.tintaSuave }}>desde el {ddmm(desde)} · jornada {jornada} h</span>
            {fechaInput}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: `${MIN_TABLA}px` }} data-testid="tabla-frentes">
              <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '20px', height: '36px', alignItems: 'center', borderBottom: `1px solid ${C.borde}`, ...EYEBROW }}>
                <div>Frente</div><div style={{ textAlign: 'right' }}>HH restantes</div><div style={{ textAlign: 'center' }}>Dotación</div>
                <div style={{ textAlign: 'right' }}>Días técnicos</div><div style={{ textAlign: 'right' }}>Termina</div>
              </div>
              {filas.map((x, i) => {
                const sub = sublineaFrente(x.f)
                const t = termina(x)
                const tec = textoDiasTecnicos(x.f.diasTecnicos)
                return (
                  <div key={x.f.clave} data-testid={`frente-${x.f.clave}`} style={{
                    display: 'grid', gridTemplateColumns: GRID, gap: '20px', height: '60px', alignItems: 'center', fontSize: '13.5px', color: C.tinta,
                    borderBottom: i === filas.length - 1 ? undefined : `1px solid ${C.borde}`,
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.f.nombre}</div>
                      <div style={{ fontSize: '12px', color: sub.tono === 'warn' ? C.warn : C.tintaSuave }}>{sub.texto}</div>
                    </div>
                    <div style={{ textAlign: 'right', color: x.sinBase ? C.tenue : C.tinta, fontStyle: x.sinBase ? 'italic' : undefined, fontVariantNumeric: 'tabular-nums' }}>
                      {x.sinBase ? <span data-nulo="">sin base</span> : n0(x.f.hhRestantes as number)}
                    </div>
                    {stepper(x, 26)}
                    <div style={{ textAlign: 'right', color: tec ? C.tintaSuave : C.tenue }}>
                      {tec ? <>{x.f.diasTecnicos} <span style={{ fontSize: '12px' }}>curado</span></> : '—'}
                    </div>
                    <div style={{ textAlign: 'right', color: t.color, fontWeight: t.despues ? 500 : 400, fontStyle: t.italica ? 'italic' : undefined, fontVariantNumeric: 'tabular-nums' }} data-testid="termina">
                      {t.texto}
                    </div>
                  </div>
                )
              })}
              {filas.length === 0 && (
                <div style={{ padding: '18px 0', fontSize: '12.5px', color: C.tintaSuave }}>
                  Esta obra no tiene actividades ejecutables cargadas, así que no hay frente que simular.
                </div>
              )}
            </div>
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: '26px', paddingLeft: '34px', borderLeft: `1px solid ${C.borde}` }}>
          {finBloque(28)}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }} data-testid="limites-reales">
            <div style={EYEBROW}>Límites reales</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', fontSize: '13.5px' }}>
              {limites.map((l) => (
                <div key={l.k} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }} data-limite={l.k}>
                  <span style={{ color: C.tintaSuave }}>{l.t}</span>
                  <span style={{ color: l.texto ? C.tinta : C.tenue, fontStyle: l.texto ? undefined : 'italic', textAlign: 'right' }}>
                    {l.texto ?? <span data-nulo="">{l.falta}</span>}
                    {l.texto && l.sufijo && <span style={{ color: C.tenue, fontSize: '12.5px' }}> {l.sufijo}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <Aplicar dot={aEscribir} puedeAplicar={puedeAplicar} aplicar={aplicar} telefono={false} />
        </aside>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${C.borde}` }}>
        <Plegable titulo="Plan · Real · Proyección por rubro" n={nRubros} nota="donde no hay avance con HH reales, dice «sin base»"
          abierto={abierto.rubros} alternar={() => setAbierto((a) => ({ ...a, rubros: !a.rubros }))} testid="rubros-hh-plegable">
          {rubros}
        </Plegable>
        <Plegable titulo="Capacidad ponderada" n={capacidad.length} nota="dos oficiales y dos ayudantes son 3,2, no 4"
          abierto={abierto.capacidad} alternar={() => setAbierto((a) => ({ ...a, capacidad: !a.capacidad }))} testid="capacidad-plegable">
          {capacidad.length === 0
            ? <p style={{ fontSize: '12.5px', color: C.tenue, margin: 0 }} data-nulo="">sin factores cargados</p>
            : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '380px' }}>
                {capacidad.map((c) => (
                  <li key={c.nombre} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', fontSize: '13px' }}>
                    <span style={{ color: C.tintaSuave }}>{c.nombre}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{c.factor.toLocaleString('es-AR', { minimumFractionDigits: 1 })}</span>
                  </li>
                ))}
              </ul>
            )}
        </Plegable>
      </div>
    </div>
  )
}

/** Una fila plegable de 44px del 08b: chevron, título 500, contador mono y la nota al final. */
function Plegable({ titulo, n, nota, abierto, alternar, children, testid }: {
  titulo: string; n: number; nota: string; abierto: boolean; alternar: () => void; children: ReactNode; testid: string
}) {
  return (
    <div data-testid={testid} data-abierto={abierto ? '1' : undefined}>
      <button type="button" onClick={alternar} aria-expanded={abierto} style={{
        font: 'inherit', border: 'none', width: '100%', height: '44px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: `1px solid ${C.borde}`,
        fontSize: '13px', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', color: C.tinta, textAlign: 'left',
      }}>
        <span style={{ color: C.tenue, display: 'flex' }}><Ico d={abierto ? P.abajo : P.derecha} s={13} /></span>
        <span style={{ fontWeight: 500 }}>{titulo}</span>
        <span style={{ fontFamily: MONO, fontSize: '11.5px', color: C.tenue }}>{n}</span>
        <span style={{ marginLeft: 'auto', fontSize: '12.5px', color: C.tenue }}>{nota}</span>
      </button>
      {abierto && <div style={{ padding: '14px 0 18px' }}>{children}</div>}
    </div>
  )
}

/** «Aplicar al plan»: grafito de 34px en el aside (08b), amarilla de 48px al pie del teléfono (M11).
 *  Escribe `dotacion_prevista` de los frentes tocados; sin nada tocado no escribe y lo dice.
 *  APAGADA se pinta como el diseño pinta una primaria apagada (C06 «Sellar línea base», MC7 «Guardar
 *  fechas»): fondo `line` y texto `faint`. La marca al 50 % de opacidad era un amarillo claro que se
 *  leía como activa. */
function Aplicar({ dot, puedeAplicar, aplicar, telefono }: {
  dot: [string, number][]; puedeAplicar: boolean; aplicar: AccionFormulario; telefono: boolean
}) {
  const [estado, ejecutar, pendiente] = useActionState<ResultadoAccion | null, FormData>((_p, form) => aplicar(form), null)
  const bloqueado = !puedeAplicar || dot.length === 0 || pendiente
  const boton = (
    <button type="submit" disabled={bloqueado} data-testid="aplicar-al-plan" title={!puedeAplicar ? 'Aplicarlo al plan es de Administración y de la jefatura de obra.' : dot.length === 0 ? 'Mové una dotación y se habilita.' : undefined}
      data-apagada={bloqueado ? '1' : undefined}
      style={telefono ? {
        font: 'inherit', width: '100%', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: '6px', border: 0,
        background: bloqueado ? C.borde : C.marca, color: bloqueado ? C.tenue : C.grafito, fontSize: '14px', fontWeight: 600,
        cursor: bloqueado ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
      } : {
        height: '34px', padding: '0 16px', border: 0, borderRadius: '6px', background: bloqueado ? C.borde : C.grafito, color: bloqueado ? C.tenue : C.superficie,
        font: 'inherit', fontFamily: 'inherit', fontSize: '13px', fontWeight: 500, cursor: bloqueado ? 'not-allowed' : 'pointer', alignSelf: 'flex-start',
        display: 'inline-flex', alignItems: 'center', gap: '7px',
      }}>
      <Ico d={P.ok} s={telefono ? 15 : 13} />{pendiente ? 'Aplicando…' : 'Aplicar al plan'}
    </button>
  )
  const form = (
    <form onSubmit={(e) => { e.preventDefault(); const datos = new FormData(e.currentTarget); startTransition(() => ejecutar(datos)) }} data-testid="form-aplicar-dotacion"
      style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {dot.map(([k, n]) => <input key={k} type="hidden" name="dot" value={`${k}~${n}`} />)}
      {boton}
      {estado?.ok === true && <span style={{ fontSize: '12px', color: C.pos }} data-testid="form-aplicar-dotacion-ok">{estado.mensaje ?? 'Dotación aplicada.'}</span>}
      {estado?.ok === false && <span style={{ fontSize: '12px', color: C.neg }} data-testid="form-aplicar-dotacion-error">{estado.error}</span>}
    </form>
  )
  if (!telefono) return form
  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: '64px', padding: '12px 16px 18px', background: C.superficie, borderTop: `1px solid ${C.borde}`, zIndex: 19 }}>
      {form}
    </div>
  )
}
