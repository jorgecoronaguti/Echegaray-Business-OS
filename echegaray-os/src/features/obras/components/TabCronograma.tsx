'use client'

// ═══ EL CRONOGRAMA — 05 (1440) · M07 (390) · C06 (`&editar=1`, 1440) · MC7 (`&editar=1`, 390) ═══
//
// Porte literal del diseño ERP Obras (dueño, 23/09/2026). UN solo cronograma: ver y editar son la
// misma pantalla con las mismas filas (`filasDelPlan`).
//
//   05    banda de nivel 3 con Semana · Mes · Trimestre a la derecha; grilla 270 px | 1fr; filas de
//         36 px; barra clara = plan, llena = ejecutado, roja = atrasada, punteada = tiempo técnico;
//         conectores de dependencia; HOY en amarillo; leyenda en una línea al pie.
//   M07   Semana · Mes en cajas de 32; lista 112 px | 1fr con barras de 14 px; HOY amarilla; pie con
//         línea base y dependencias.
//   C06   Día · Semana · Mes en la banda; 21+ columnas de días hábiles de ESTA obra; barras de 16 px
//         con extremos arrastrables; «sin fechas · arrastrá para fijar»; «Sellar línea base» apagado
//         con motivo mientras el checklist trabe y «Guardar fechas» van EN LA CABECERA DE LA OBRA,
//         junto al nombre (`EditorCronogramaContexto`): el editor publica su estado y la cabecera
//         dibuja los botones. Sin provider, los dibuja acá, en la banda.
//   MC7   una fila por ítem con dos fechas de 76×40 en mono; «Guardar fechas» de 48 px sobre la barra.
//
// LO QUE SE RETIRÓ: la franja de cinco cifras, las capas encendibles y las archivadas plegadas de
// la versión anterior — no están dibujadas.

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as PE } from 'react'
import type { ResultadoAccion } from '@/shared/components/ui'
import type { Actividad } from '../types'
import {
  bajadaDuracion, cambiosDeFechas, conFechas, diasHabilesDelEditor, ESCALA_LABEL, ESCALAS_VISTA, filasDelPlan,
  fraccionLlena, indiceDe, mesesDeVentana, motivoSellarApagado, moverExtremo, pares, posPct, semanasDe,
  textoPrecedencia, tonoDeFila, tramoVista, ventanaVista, type EscalaVista, type FechasEditadas, type FilaPlan,
} from '../services/cronogramaPlan'
import { conectoresDe } from '../services/conectoresGantt'
import { useAnchoVentana } from './useAnchoVentana'
import { C, MONO } from './canon/tokens'
import { Ico, P } from './canon/Ico'
import { SubNavTrabajo } from './SubNavTrabajo'
import { AccionesEditorCronograma, useEditorCronograma, type EstadoEditorCronograma } from './EditorCronogramaContexto'

const ALTO_FILA = 36
/** El ancho de una columna del 05: la semana mide 139 px (17 ago → 5 oct en 1.110 px del diseño). */
const ANCHO_COLUMNA: Record<EscalaVista, number> = { semana: 139, mes: 150, trimestre: 180 }
const ALTO_FILA_EDITOR = 40
const EYEBROW: CSSProperties = { fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase' }

interface Props {
  obraId: string
  actividades: Actividad[]
  dependencias: { origen_id: string; destino_id: string }[]
  isodows: number[]
  feriados: string[]
  actividadAbierta: string | null
  hoy: string
  guardarFechas: (form: FormData) => Promise<ResultadoAccion>
  sellar?: () => Promise<ResultadoAccion>
  fallas: string[]
}

export function TabCronograma(props: Props) {
  const editar = useSearchParams().get('editar') === '1'
  const telefono = useAnchoVentana() < 768
  const filas = useMemo(() => filasDelPlan(props.actividades), [props.actividades])
  if (editar) return telefono ? <EditorTelefono {...props} filas={filas} /> : <Editor {...props} filas={filas} />
  return telefono ? <VistaTelefono {...props} filas={filas} /> : <Vista {...props} filas={filas} />
}

const Falla = ({ fallas }: { fallas: string[] }) => fallas.length > 0 && (
  <div data-testid="cronograma-lectura-fallida" style={{ padding: '10px 30px 0', fontSize: '12.5px', color: C.neg }}>
    No se pudo leer parte del cronograma: {fallas.join(' · ')}
  </div>
)

const colorDeTono = (t: ReturnType<typeof tonoDeFila>) => (t === 'atrasada' ? C.neg : C.grafito)

// ═══════════════════════════════ 05 · VISTA ═══════════════════════════════

function Vista({ obraId, filas, dependencias, hoy, fallas, actividadAbierta }: Props & { filas: FilaPlan[] }) {
  const [escala, setEscala] = useState<EscalaVista>('semana')
  const ventana = useMemo(() => ventanaVista(pares(filas), escala, hoy), [filas, escala, hoy])
  const tramos = useMemo(() => filas.map((f) => (ventana ? tramoVista(ventana, f.inicio, f.fin) : null)), [filas, ventana])
  const conectores = useMemo(() => conectoresDe(
    filas.map((f, i) => ({ actividadId: f.actividadId, tramo: tramos[i] })), dependencias, { altoFila: ALTO_FILA },
  ), [filas, tramos, dependencias])
  const atrasadaDe = useMemo(() => new Map(filas.filter((f) => f.actividadId).map((f) => [f.actividadId as string, tonoDeFila(f, hoy) === 'atrasada'])), [filas, hoy])
  const hoyPct = ventana ? posPct(ventana, hoy) : null
  const router = useRouter()
  const [resaltada, setResaltada] = useState<number | null>(null)
  const lienzoRef = useRef<HTMLDivElement>(null)
  const anchoLienzo = ventana ? ventana.columnas.length * ANCHO_COLUMNA[escala] : 0
  // ABRE CON HOY A LA VISTA: a un tercio del ancho visible, como el 05 (y otra vez al cambiar la escala).
  useEffect(() => {
    const el = lienzoRef.current
    if (!el || hoyPct == null) return
    const x = 270 + (hoyPct / 100) * Math.max(anchoLienzo, el.scrollWidth - 270)
    el.scrollLeft = Math.max(0, x - 270 - (el.clientWidth - 270) / 3)
  }, [hoyPct, anchoLienzo])

  return (
    <>
      {/* 05: Semana · Mes · Trimestre A LA DERECHA de la banda, como el diseño (no pegado a las solapas). */}
      <SubNavTrabajo obraId={obraId} sub="gantt" alFinal={
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12.5px', color: C.tintaSuave }}>
          {ESCALAS_VISTA.map((e) => (
            <button key={e} type="button" data-testid={`escala-${e}`} aria-pressed={escala === e} onClick={() => setEscala(e)} style={{
              border: 'none', background: 'none', padding: '0 0 2px', font: 'inherit', cursor: 'pointer',
              color: escala === e ? C.tinta : C.tintaSuave, fontWeight: escala === e ? 500 : 400,
              boxShadow: escala === e ? `inset 0 -1.5px 0 ${C.tinta}` : 'none',
            }}>{ESCALA_LABEL[e]}</button>
          ))}
          {/* La puerta al editor (C06). El diseño la pone en la cabecera de la obra, que es de otro frente. */}
          <Link prefetch={false} href={`/obras/${obraId}?vista=tareas&sub=gantt&editar=1`} data-testid="cronograma-editar"
            style={{ color: C.tintaSuave, textDecoration: 'underline', marginLeft: '6px' }}>Editar fechas</Link>
        </div>
      } />
      <Falla fallas={fallas} />
      <div data-testid="cronograma-obra" style={{ padding: '26px 30px 32px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
        {!ventana
          ? <SinFechas obraId={obraId} n={filas.filter((f) => f.nivel !== 0).length} />
          : (
            // ═══ EL LIENZO DEL 05, CON LA ESCALA DEL DISEÑO Y LA LECTURA DE UN GANTT DE VERDAD (dueño 25/09:
            // «este gantt no es fiel al diseño ni en ui ni en ux») ═══
            //   · la columna mide lo del diseño (139 px la semana: 17 ago → 5 oct en 1.110 px) y la obra
            //     larga se CORRE de costado en vez de aplastar noventa tareas en rayitas de 3 px;
            //   · abre con HOY a la vista (la línea amarilla del 05 queda a un tercio del ancho);
            //   · el eje de fechas y la columna de nombres quedan FIJOS al desplazarse: bajando por la
            //     tarea 60 se sigue sabiendo qué fila es y qué semana;
            //   · la fila se marca al pasar y abre la tarea al tocarla (el panel de la tarea en Tareas).
            <div ref={lienzoRef} data-testid="cronograma-lienzo" style={{
              overflow: 'auto', maxHeight: 'calc(100vh - 260px)', minHeight: '240px', position: 'relative',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: `270px minmax(${anchoLienzo}px,1fr)`, gridTemplateRows: `26px repeat(${filas.length}, ${ALTO_FILA}px)`, position: 'relative' }}>
                <div style={{ gridColumn: 1, gridRow: 1, position: 'sticky', top: 0, left: 0, zIndex: 5, background: C.superficie }} />
                <div style={{
                  gridColumn: 2, gridRow: 1, position: 'sticky', top: 0, zIndex: 4, background: C.superficie,
                  display: 'grid', gridTemplateColumns: `repeat(${ventana.columnas.length},1fr)`,
                }}>
                  {ventana.columnas.map((c) => (
                    <div key={c.iso} style={{ fontSize: '11px', color: c.esHoy ? C.tinta : C.tenue, fontWeight: c.esHoy ? 500 : 400, whiteSpace: 'nowrap' }}>{c.rotulo}</div>
                  ))}
                </div>

                {/* HOY, los conectores: una capa sobre la columna del gráfico, de la primera fila a la última. */}
                <div style={{ gridColumn: 2, gridRow: `2 / ${filas.length + 2}`, position: 'relative', pointerEvents: 'none', zIndex: 2 }}>
                  {hoyPct != null && (
                    <div data-testid="linea-hoy" style={{ position: 'absolute', left: `${hoyPct}%`, top: 0, bottom: 0, width: '1px', background: C.marca }} />
                  )}
                  {conectores.conectores.map((k) => {
                    const destino = k.clave.split('->')[1]
                    const color = atrasadaDe.get(destino) ? C.neg : C.fantasma
                    return (
                      <span key={k.clave} data-testid="conector">
                        {k.segmentos.map((sg, n) => (
                          <div key={n} style={{
                            position: 'absolute', left: `${sg.izqPct}%`, top: `${sg.topPx}px`,
                            width: sg.altoPx === 0 ? `${sg.anchoPct}%` : '1px', height: sg.altoPx === 0 ? '1px' : `${sg.altoPx}px`, background: color,
                          }} />
                        ))}
                        <div style={{
                          position: 'absolute', left: `calc(${k.flecha.izqPct}% - 5px)`, top: `${k.flecha.topPx - 3}px`, width: 0, height: 0,
                          borderTop: '3px solid transparent', borderBottom: '3px solid transparent', borderLeft: `5px solid ${color}`,
                        }} />
                      </span>
                    )
                  })}
                </div>

                {filas.map((f, i) => {
                  const t = tramos[i]
                  const tono = tonoDeFila(f, hoy)
                  const fila = i + 2
                  const marcada = f.nivel !== 0 && (resaltada === i || f.actividadId === actividadAbierta)
                  const fondo = marcada ? C.tenueFondo : C.superficie
                  const abrir = f.actividadId ? `/obras/${obraId}?vista=tareas&sub=arbol&act=${f.actividadId}` : null
                  const proyeccion = tono === 'atrasada' && f.finForecast && f.fin && f.finForecast > f.fin
                    ? tramoVista(ventana, f.fin, f.finForecast) : null
                  const detalle = [f.nombre, f.inicio && f.fin ? `${f.inicio.slice(8, 10)}/${f.inicio.slice(5, 7)} → ${f.fin.slice(8, 10)}/${f.fin.slice(5, 7)}` : 'sin fechas',
                    proyeccion && f.finForecast ? `proyectado ${f.finForecast.slice(8, 10)}/${f.finForecast.slice(5, 7)}` : null].filter(Boolean).join(' · ')
                  const hover = f.nivel === 0 ? {} : { onMouseEnter: () => setResaltada(i), onMouseLeave: () => setResaltada(null) }
                  return (
                    <Fragment key={f.clave}>
                      {f.nivel === 0
                        ? (
                          <div style={{ gridColumn: 1, gridRow: fila, position: 'sticky', left: 0, zIndex: 3, background: C.superficie, display: 'flex', alignItems: 'center', fontSize: '10.5px', letterSpacing: '.08em', textTransform: 'uppercase', color: C.tenue, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            <span style={{ fontFamily: MONO, letterSpacing: 0, marginRight: '8px' }}>{numeroDeRubro(filas, f)}</span>{f.nombre}
                          </div>
                          )
                        : (
                          <div {...hover} data-testid={`fila-${f.actividadId}`} style={{
                            gridColumn: 1, gridRow: fila, position: 'sticky', left: 0, zIndex: 3, background: fondo,
                            display: 'flex', alignItems: 'center', paddingLeft: '14px', paddingRight: '12px', fontSize: '13px', minWidth: 0,
                            color: tono === 'atrasada' ? C.neg : f.sinPlan ? C.tintaSuave : C.tinta,
                            fontWeight: f.actividadId === actividadAbierta ? 600 : 400,
                          }}>
                            {abrir
                              ? <Link prefetch={false} href={abrir} title={detalle} style={{ color: 'inherit', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{f.nombre}</Link>
                              : <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre}</span>}
                          </div>
                          )}
                      {f.nivel === 0
                        ? (
                          <div style={{ gridColumn: 2, gridRow: fila, position: 'relative' }}>
                            {t && <div style={{ position: 'absolute', left: `${t.izqPct}%`, top: '17px', width: `${t.anchoPct}%`, height: '2px', background: C.fantasma }} />}
                          </div>
                          )
                        : !t
                          ? <div {...hover} style={{ gridColumn: 2, gridRow: fila, background: fondo, display: 'flex', alignItems: 'center', fontSize: '12px', color: C.tenue }}>sin fechas</div>
                          : (
                            <div {...hover} data-testid={`barra-${f.actividadId}`} title={detalle}
                              onClick={() => { if (abrir) router.push(abrir) }}
                              style={{ gridColumn: 2, gridRow: fila, position: 'relative', background: fondo, cursor: abrir ? 'pointer' : 'default' }}>
                              {tono === 'tecnico'
                                ? <div style={{ position: 'absolute', left: `${t.izqPct}%`, top: '15px', width: `${t.anchoPct}%`, height: '6px', borderRadius: '3px', background: C.superficie, border: `1px dashed ${C.bordeFuerte}`, boxSizing: 'border-box' }} />
                                : (
                                  <>
                                    <div style={{ position: 'absolute', left: `${t.izqPct}%`, top: '15px', width: `${t.anchoPct}%`, height: '6px', borderRadius: '3px', background: C.borde }} />
                                    {fraccionLlena(f) > 0 && (
                                      <div style={{ position: 'absolute', left: `${t.izqPct}%`, top: '15px', width: `${t.anchoPct * fraccionLlena(f)}%`, height: '6px', borderRadius: '3px', background: colorDeTono(tono) }} />
                                    )}
                                    {proyeccion && (
                                      <div style={{
                                        position: 'absolute', left: `${proyeccion.izqPct}%`, top: '15px', width: `${proyeccion.anchoPct}%`, height: '6px', borderRadius: '3px',
                                        background: `repeating-linear-gradient(45deg, ${C.neg}, ${C.neg} 3px, ${C.negBorde} 3px, ${C.negBorde} 6px)`,
                                      }} />
                                    )}
                                  </>
                                  )}
                            </div>
                            )}
                    </Fragment>
                  )
                })}
              </div>
            </div>
            )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '30px', fontSize: '12px', color: C.tenue }}>
          <span>Barra clara: plan · llena: ejecutado · roja: atrasada · punteada: tiempo técnico</span>
          <span style={{ marginLeft: 'auto' }} data-testid="cronograma-precedencia">{textoPrecedencia(filas, dependencias)}</span>
        </div>
      </div>
    </>
  )
}

/** «1», «2», «3»: la posición del rubro entre los rubros. */
function numeroDeRubro(filas: readonly FilaPlan[], f: FilaPlan): number {
  return filas.filter((x) => x.nivel === 0).indexOf(f) + 1
}

function SinFechas({ obraId, n }: { obraId: string; n: number }) {
  return (
    <div data-testid="cronograma-sin-fechas" style={{ fontSize: '13px', color: C.tintaSuave }}>
      {n === 0
        ? 'Esta obra todavía no tiene actividades cargadas.'
        : `Ninguna de las ${n} actividades tiene fechas de plan: no hay barras que dibujar.`}{' '}
      <Link prefetch={false} href={`/obras/${obraId}?vista=tareas&sub=gantt&editar=1`} style={{ color: C.tinta, fontWeight: 500, textDecoration: 'underline' }}>
        Cargar las fechas
      </Link>
    </div>
  )
}

// ═══════════════════════════════ M07 · TELÉFONO ═══════════════════════════════

function VistaTelefono({ obraId, filas, dependencias, hoy, fallas }: Props & { filas: FilaPlan[] }) {
  const [escala, setEscala] = useState<EscalaVista>('semana')
  const ventana = useMemo(() => ventanaVista(pares(filas), escala, hoy), [filas, escala, hoy])
  const actos = filas.filter((f) => f.nivel !== 0)
  const hoyPct = ventana ? posPct(ventana, hoy) : null
  const con = new Set(dependencias.flatMap((d) => [d.origen_id, d.destino_id]))
  const nDeps = actos.filter((f) => f.actividadId && con.has(f.actividadId)).length
  const selladas = actos.filter((f) => f.inicioBase || f.finBase).length
  const caja = (activo: boolean): CSSProperties => ({
    font: 'inherit', height: '44px', padding: '0 12px', display: 'flex', alignItems: 'center', border: `1px solid ${activo ? C.grafito : C.borde}`,
    borderRadius: '6px', fontWeight: activo ? 500 : 400, color: activo ? C.tinta : C.tintaSuave, background: C.superficie, cursor: 'pointer',
  })
  return (
    <>
      <SubNavTrabajo obraId={obraId} sub="gantt" />
      <Falla fallas={fallas} />
      <div data-testid="cronograma-obra" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '6px', fontSize: '12.5px' }}>
            {(['semana', 'mes'] as EscalaVista[]).map((e) => (
              <button key={e} type="button" data-testid={`escala-${e}`} aria-pressed={escala === e} onClick={() => setEscala(e)} style={caja(escala === e)}>{ESCALA_LABEL[e]}</button>
            ))}
          </div>
          <div style={{ fontSize: '12px', color: C.tintaSuave, fontFamily: MONO }}>{ventana ? mesesDeVentana(ventana) : 'sin fechas'}</div>
        </div>
        {!ventana
          ? <SinFechas obraId={obraId} n={actos.length} />
          : (
            // CADA SEMANA MIDE 40px Y EL GRÁFICO SE CORRE DE COSTADO (M07): repartir 14 semanas en 270px
            // dejaba las tareas de una semana como cuadraditos de 20px. El nombre queda fijo a la izquierda.
            <div style={{ overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }} data-testid="cronograma-telefono-scroll">
            <div style={{ position: 'relative', minWidth: `${120 + ventana.columnas.length * (escala === 'semana' ? 40 : 56)}px` }}>
              <div style={{ display: 'grid', gridTemplateColumns: '112px 1fr', gap: '8px', height: '26px', alignItems: 'center', borderBottom: `1px solid ${C.borde}` }}>
                <div style={{ position: 'sticky', left: 0, background: C.superficie, height: '100%', zIndex: 1 }} />
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ventana.columnas.length},1fr)`, fontFamily: MONO, fontSize: '10px', color: C.tenue }}>
                  {ventana.columnas.map((c) => <span key={c.iso}>{escala === 'semana' ? c.iso.slice(8, 10) : c.rotulo}</span>)}
                </div>
              </div>
              {actos.map((f, i) => {
                const t = tramoVista(ventana, f.inicio, f.fin)
                const tono = tonoDeFila(f, hoy)
                const relleno = tono === 'atrasada' ? C.neg : tono === 'ejecutado' ? C.curso : C.grafito
                return (
                  <div key={f.clave} data-testid={`fila-${f.actividadId}`} style={{
                    display: 'grid', gridTemplateColumns: '112px 1fr', gap: '8px', height: '44px', alignItems: 'center',
                    borderBottom: i === actos.length - 1 ? 'none' : `1px solid ${C.borde}`,
                  }}>
                    <div style={{ fontSize: '12.5px', position: 'sticky', left: 0, background: C.superficie, zIndex: 1, alignSelf: 'stretch', display: 'flex', alignItems: 'center', minWidth: 0 }}>
                      {/* M07 «Relleno y compact.»: el nombre se corta con puntos suspensivos (en un contenedor flex el
                          text-overflow no aplica al texto suelto; va en su propio bloque). */}
                      <span style={{ display: 'block', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.nombre}</span>
                    </div>
                    {t
                      ? (
                        <div style={{ position: 'relative', height: '100%' }}>
                          <div style={{
                            position: 'absolute', left: `${t.izqPct}%`, width: `${t.anchoPct}%`, top: '15px', height: '14px', borderRadius: '3px',
                            background: tono === 'tecnico' ? C.superficie : C.borde, overflow: 'hidden',
                            border: tono === 'tecnico' ? `1px dashed ${C.bordeFuerte}` : 'none', boxSizing: 'border-box',
                          }}>
                            {tono !== 'tecnico' && <div style={{ width: `${fraccionLlena(f) * 100}%`, height: '100%', background: relleno }} />}
                          </div>
                        </div>
                        )
                      : <div style={{ fontSize: '11.5px', color: C.tenue, fontStyle: 'italic' }}>sin fechas</div>}
                  </div>
                )
              })}
              {hoyPct != null && (
                <div data-testid="linea-hoy" style={{ position: 'absolute', left: `calc(120px + (100% - 120px)*${hoyPct / 100})`, top: 0, bottom: 0, width: '1px', background: C.marca }} />
              )}
            </div>
            </div>
            )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: C.tintaSuave }}>
          <span>Línea base: <span style={{ color: C.tenue, fontStyle: 'italic' }}>{selladas > 0 ? 'copia del plan' : 'sin sellar'}</span></span>
          <span>Dependencias: {nDeps} de {actos.length}</span>
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════ C06 · EDITOR ═══════════════════════════════

function useEdicion(filas: FilaPlan[], guardarFechas: Props['guardarFechas'], sellar?: Props['sellar']) {
  const [editadas, setEditadas] = useState<Record<string, FechasEditadas>>({})
  const [estado, setEstado] = useState<ResultadoAccion | null>(null)
  const [pendiente, setPendiente] = useState(false)
  const fechasDe = (f: FilaPlan): FechasEditadas => (f.actividadId && editadas[f.actividadId]) || { inicio: f.inicio, fin: f.fin }
  const poner = (id: string, v: FechasEditadas) => setEditadas((e) => ({ ...e, [id]: v }))
  const cambios = cambiosDeFechas(filas, editadas)
  async function guardar() {
    const fd = new FormData()
    for (const c of cambios) { fd.set(`inicio_${c.actividadId}`, c.inicio ?? ''); fd.set(`fin_${c.actividadId}`, c.fin ?? '') }
    setPendiente(true)
    const r = await guardarFechas(fd)
    setPendiente(false)
    setEstado(r)
    if (r.ok) setEditadas({})
  }
  async function sellarAhora() {
    if (!sellar) return
    setPendiente(true)
    const r = await sellar()
    setPendiente(false)
    setEstado(r)
  }
  return { editadas, fechasDe, poner, cambios, estado, pendiente, guardar, sellarAhora }
}

const Resultado = ({ estado }: { estado: ResultadoAccion | null }) => estado != null && (
  <span data-testid={estado.ok ? 'fechas-ok' : 'fechas-error'} style={{ fontSize: '12px', color: estado.ok ? C.pos : C.neg }}>
    {estado.ok ? estado.mensaje ?? 'Guardado.' : estado.error}
  </span>
)

function Editor({ obraId, filas, dependencias, isodows, feriados, hoy, fallas, guardarFechas, sellar }: Props & { filas: FilaPlan[] }) {
  const setFeriados = useMemo(() => new Set(feriados), [feriados])
  const dias = useMemo(() => diasHabilesDelEditor(pares(filas), hoy, isodows, setFeriados), [filas, hoy, isodows, setFeriados])
  const semanas = useMemo(() => semanasDe(dias), [dias])
  const ed = useEdicion(filas, guardarFechas, sellar)
  const motivo = motivoSellarApagado(filas)
  // LAS ACCIONES VAN EN LA CABECERA (C06). El editor sigue siendo el dueño del estado: publica una
  // foto cuando cambia algo que los botones necesitan, y las funciones se leen por ref para que la
  // foto no se reescriba en cada render.
  const ctx = useEditorCronograma()
  const publicar = ctx?.publicar
  const accionesRef = useRef({ sellar: ed.sellarAhora, guardar: ed.guardar })
  useEffect(() => { accionesRef.current = { sellar: ed.sellarAhora, guardar: ed.guardar } })
  const sellarDesdeCabecera = useCallback(() => { void accionesRef.current.sellar() }, [])
  const guardarDesdeCabecera = useCallback(() => { void accionesRef.current.guardar() }, [])
  const puedeSellar = sellar != null
  const nCambios = ed.cambios.length
  const estadoEditor: EstadoEditorCronograma = {
    motivo, puedeSellar, cambios: nCambios, pendiente: ed.pendiente, sellar: sellarDesdeCabecera, guardar: guardarDesdeCabecera,
  }
  useEffect(() => {
    if (!publicar) return
    publicar({ motivo, puedeSellar, cambios: nCambios, pendiente: ed.pendiente, sellar: sellarDesdeCabecera, guardar: guardarDesdeCabecera })
  }, [publicar, motivo, puedeSellar, nCambios, ed.pendiente, sellarDesdeCabecera, guardarDesdeCabecera])
  useEffect(() => () => { publicar?.(null) }, [publicar])
  const n = dias.length
  const hoyIdx = indiceDe(dias, hoy, 'inicio')
  const arrastre = useRef<{ id: string; extremo: 'inicio' | 'fin' | 'barra'; x0: number; ancho: number; base: FechasEditadas } | null>(null)
  const filaRef = useRef<HTMLDivElement | null>(null)

  const empezar = (e: PE<HTMLElement>, f: FilaPlan, extremo: 'inicio' | 'fin' | 'barra') => {
    if (!f.actividadId) return
    const celda = (e.currentTarget.closest('[data-celdas]') as HTMLElement | null)
    if (!celda) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    arrastre.current = { id: f.actividadId, extremo, x0: e.clientX, ancho: celda.getBoundingClientRect().width / n, base: ed.fechasDe(f) }
  }
  const mover = (e: PE<HTMLElement>) => {
    const a = arrastre.current
    if (!a) return
    const delta = Math.round((e.clientX - a.x0) / a.ancho)
    ed.poner(a.id, moverExtremo(dias, a.base, a.extremo, delta))
  }
  const soltar = () => { arrastre.current = null }
  const fijar = (e: { currentTarget: HTMLDivElement; clientX: number }, f: FilaPlan) => {
    if (!f.actividadId) return
    const rect = e.currentTarget.getBoundingClientRect()
    const i = Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - rect.left) / rect.width) * n)))
    ed.poner(f.actividadId, { inicio: dias[i], fin: dias[i] })
  }

  const caja = (activo: boolean, apagado = false): CSSProperties => ({
    font: 'inherit', height: '32px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px', border: `1px solid ${activo ? C.grafito : C.borde}`,
    borderRadius: '6px', fontSize: '12.5px', fontWeight: activo ? 500 : 400, color: apagado ? C.apagado : activo ? C.tinta : C.tintaSuave,
    background: C.superficie, cursor: apagado ? 'default' : 'pointer',
  })

  return (
    <>
      <SubNavTrabajo obraId={obraId} sub="gantt" derecha={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" style={caja(true)} data-testid="escala-dia" aria-pressed>Día</button>
            <button type="button" style={caja(false, true)} disabled title="En el editor se trabaja por día hábil">Semana</button>
            <button type="button" style={caja(false, true)} disabled title="En el editor se trabaja por día hábil">Mes</button>
          </div>
          {/* Sin provider (la página no envolvió la pantalla), las acciones se dibujan acá. */}
          {!ctx && <AccionesEditorCronograma estado={estadoEditor} />}
        </div>
      } />
      <Falla fallas={fallas} />
      <div data-testid="cronograma-editor" style={{ padding: '16px 20px 30px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {(motivo || ed.estado) && (
          <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: C.tintaSuave }}>
            {motivo && <span data-testid="sellar-motivo">{motivo}</span>}
            <Resultado estado={ed.estado} />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', height: '30px', alignItems: 'center', borderBottom: `1px solid ${C.borde}` }}>
          <div style={{ ...EYEBROW, paddingLeft: '4px' }}>Ítem</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n},1fr)`, fontFamily: MONO, fontSize: '10.5px', color: C.tenue }}>
            {dias.map((d, i) => {
              const lunes = semanas.some((s) => s.desdeIdx === i)
              return <div key={d} style={{ textAlign: 'center', color: lunes ? C.tintaMedia : C.tenue, fontWeight: lunes ? 500 : 400 }}>{d.slice(8, 10)}</div>
            })}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', height: '22px', alignItems: 'center', marginTop: '-14px' }}>
          <div />
          <div style={{ display: 'grid', gridTemplateColumns: semanas.map((s) => `${s.n}fr`).join(' '), ...EYEBROW, fontSize: '10px' }}>
            {semanas.map((s) => <div key={s.rotulo}>{s.n >= 3 ? s.rotulo : dias[s.desdeIdx].slice(8, 10)}</div>)}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', marginTop: '-14px' }} ref={filaRef}>
          {filas.map((f) => {
            const v = ed.fechasDe(f)
            const i0 = v.inicio ? indiceDe(dias, v.inicio, 'inicio') : null
            const i1 = v.fin ? indiceDe(dias, v.fin, 'fin') : i0
            const conBarra = i0 != null && i1 != null
            const esRubro = f.nivel === 0
            return (
              <div key={f.clave} data-testid={f.actividadId ? `fila-${f.actividadId}` : undefined} style={{
                display: 'grid', gridTemplateColumns: '300px 1fr', height: `${ALTO_FILA_EDITOR}px`, alignItems: 'center', borderBottom: `1px solid ${C.bordeTarjeta}`,
              }}>
                <div style={{
                  paddingLeft: esRubro ? '4px' : '52px', fontSize: esRubro ? '12.5px' : '13px', fontWeight: esRubro ? 600 : 400,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', gap: '8px', alignItems: 'center',
                }}>
                  {esRubro ? `${numeroDeRubro(filas, f)} · ${f.nombre}` : f.nombre}
                  {!esRubro && f.nHijas > 0 && <span style={{ fontSize: '11px', color: C.tenue }}>{f.nHijas} subtareas</span>}
                  {f.esTiempoTecnico && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: C.warn }}><Ico d={P.hh} s={11} />tiempo técnico</span>}
                </div>
                <div data-celdas style={{ position: 'relative', height: '100%', display: 'grid', gridTemplateColumns: `repeat(${n},1fr)` }}
                  onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}
                  onDoubleClick={(e) => !conBarra && !esRubro && fijar(e, f)}
                  onPointerDown={(e) => { if (!conBarra && !esRubro && e.target === e.currentTarget) fijar(e, f) }}>
                  {dias.map((d, i) => (
                    <div key={d} style={{ borderLeft: `1px solid ${semanas.some((s) => s.desdeIdx === i) ? C.borde : C.bordeLista}`, pointerEvents: 'none' }} />
                  ))}
                  {conBarra
                    ? (
                      <div data-testid={f.actividadId ? `barra-${f.actividadId}` : undefined}
                        onPointerDown={(e) => !esRubro && empezar(e, f, 'barra')} style={{
                          position: 'absolute', top: '12px', height: '16px', left: `calc(${i0}/${n}*100% + 2px)`, width: `calc(${i1 - i0 + 1}/${n}*100% - 4px)`,
                          borderRadius: '3px', background: esRubro ? C.apagado : f.esTiempoTecnico ? C.superficie : C.grafito,
                          border: f.esTiempoTecnico ? `1px dashed ${C.bordeFuerte}` : 'none', boxSizing: 'border-box',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 3px', cursor: esRubro ? 'default' : 'grab', touchAction: 'none',
                        }}>
                        {!esRubro && (
                          <>
                            <span onPointerDown={(e) => { e.stopPropagation(); empezar(e, f, 'inicio') }} aria-label="Mover el inicio" style={{ width: '4px', height: '10px', borderRadius: '1px', background: C.superficie, opacity: .55, cursor: 'ew-resize' }} />
                            <span onPointerDown={(e) => { e.stopPropagation(); empezar(e, f, 'fin') }} aria-label="Mover el fin" style={{ width: '4px', height: '10px', borderRadius: '1px', background: C.superficie, opacity: .55, cursor: 'ew-resize' }} />
                          </>
                        )}
                      </div>
                      )
                    : (
                      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', paddingLeft: '8px', fontSize: '12px', color: C.tenue, fontStyle: 'italic', pointerEvents: 'none' }}>
                        {esRubro ? 'sin fechas' : 'sin fechas · arrastrá para fijar'}
                      </div>
                      )}
                </div>
              </div>
            )
          })}
          {hoyIdx != null && (
            <div data-testid="linea-hoy" style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(300px + (100% - 300px)*${hoyIdx}/${n})`, width: '1px', background: C.marca, pointerEvents: 'none' }} />
          )}
        </div>
        <div style={{ display: 'flex', gap: '28px', fontSize: '12px', color: C.tintaSuave }}>
          <span>Los extremos se arrastran; la duración es en días hábiles de esta obra.</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Ico d={P.dep} s={12} />Dependencias · {dependencias.length}</span>
          <span>La línea base se escribe una sola vez; después mover fechas mide desvío.</span>
        </div>
      </div>
    </>
  )
}

/** MC7: la fecha se LEE «24/08» en mono dentro de la caja de 76×40, como la dibuja el diseño. El
 *  `<input type="date">` nativo no entra en 76px (mostraba «22 / 2026», sin el mes): va encima,
 *  invisible y del mismo tamaño, así que tocar la caja abre el selector del teléfono. */
function FechaCorta({ etiqueta, valor, testid, estilo, alCambiar }: {
  etiqueta: string; valor: string | null; testid: string; estilo: CSSProperties; alCambiar: (v: string | null) => void
}) {
  return (
    <label style={{ ...estilo, position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: valor ? C.tinta : C.tenue }}>
      {valor ? `${valor.slice(8, 10)}/${valor.slice(5, 7)}` : '—'}
      <input type="date" aria-label={etiqueta} value={valor ?? ''} data-testid={testid} onChange={(e) => alCambiar(e.target.value || null)}
        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', border: 0, padding: 0, cursor: 'pointer' }} />
    </label>
  )
}

// ═══════════════════════════════ MC7 · EDITOR EN EL TELÉFONO ═══════════════════════════════

function EditorTelefono({ obraId, filas, isodows, feriados, hoy, fallas, guardarFechas, sellar }: Props & { filas: FilaPlan[] }) {
  const setFeriados = useMemo(() => new Set(feriados), [feriados])
  const dias = useMemo(() => diasHabilesDelEditor(pares(filas), hoy, isodows, setFeriados), [filas, hoy, isodows, setFeriados])
  const ed = useEdicion(filas, guardarFechas, sellar)
  const actos = filas.filter((f) => f.nivel !== 0)
  const cf = conFechas(filas)
  const primera = actos.find((f) => f.inicio)
  const ultima = [...actos].reverse().find((f) => f.fin)
  const habiles = primera?.inicio && ultima?.fin ? dias.filter((d) => d >= primera.inicio! && d <= ultima.fin!).length : null
  const campo: CSSProperties = {
    width: '76px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.bordeFuerte}`,
    borderRadius: '6px', fontFamily: MONO, fontSize: '13px', background: C.superficie, color: C.tinta, padding: '0 4px', boxSizing: 'border-box',
  }
  return (
    <>
      <SubNavTrabajo obraId={obraId} sub="gantt" />
      <Falla fallas={fallas} />
      <div data-testid="cronograma-editor" style={{ padding: '16px 16px 96px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: '12.5px', color: C.tintaSuave }}>
            Con fechas <b style={{ fontWeight: 600, color: C.tinta }}>{cf.con} de {cf.total}</b>{habiles != null && ` · ${habiles} días hábiles`}
          </div>
          <div style={{ fontSize: '12px', color: C.tintaSuave, display: 'inline-flex', gap: '5px', alignItems: 'center' }}><Ico d={P.fecha} s={12} />Fechas · el plan</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {actos.map((f) => {
            const v = ed.fechasDe(f)
            const bajada = bajadaDuracion({ ...f, inicio: v.inicio, fin: v.fin }, dias)
            const aviso = bajada === 'sin fechas' || f.esTiempoTecnico
            return (
              <div key={f.clave} data-testid={`fila-${f.actividadId}`} style={{ minHeight: '60px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: `1px solid ${C.bordeTarjeta}` }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.nombre}</div>
                  <div style={{ fontSize: '12px', color: aviso ? C.warn : C.tintaSuave }}>{bajada}</div>
                </div>
                <FechaCorta etiqueta={`Inicio de ${f.nombre}`} valor={v.inicio} testid={`inicio-${f.actividadId}`} estilo={campo}
                  alCambiar={(x) => f.actividadId && ed.poner(f.actividadId, { inicio: x, fin: v.fin && x && v.fin < x ? x : v.fin })} />
                <FechaCorta etiqueta={`Fin de ${f.nombre}`} valor={v.fin} testid={`fin-${f.actividadId}`} estilo={campo}
                  alCambiar={(x) => f.actividadId && ed.poner(f.actividadId, { inicio: v.inicio && x && x < v.inicio ? x : v.inicio, fin: x })} />
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: C.tintaSuave }}>
          <Ico d={P.info} s={12} />La línea base se escribe una sola vez; después mover fechas mide desvío.
        </div>
        <Resultado estado={ed.estado} />
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: '64px', padding: '12px 16px 18px', background: C.superficie, borderTop: `1px solid ${C.borde}`, zIndex: 10, margin: '0 auto', maxWidth: '430px' }}>
          <button type="button" data-testid="guardar-fechas" disabled={ed.cambios.length === 0 || ed.pendiente} onClick={ed.guardar} style={{
            width: '100%', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: '6px',
            background: ed.cambios.length ? C.marca : C.borde, color: ed.cambios.length ? C.grafito : C.tenue, fontSize: '14px', fontWeight: 600,
            border: 'none', fontFamily: 'inherit', cursor: ed.cambios.length ? 'pointer' : 'default',
          }}><Ico d={P.ok} s={15} />{ed.pendiente ? 'Guardando…' : 'Guardar fechas'}</button>
        </div>
      </div>
    </>
  )
}
