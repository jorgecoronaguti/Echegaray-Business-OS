'use client'

// EL GANTT DE OBRA. Es la herramienta de ejecución del módulo, no un gráfico.
//
// ═══ POR QUÉ ES CÓDIGO PROPIO Y NO UNA LIBRERÍA ═══
//
// Se evaluaron las vigentes (agosto 2026). Las dos serias con licencia MIT —`dhtmlx-gantt` 10.x y
// `@svar-ui/react-gantt`— ponen **baseline y camino crítico detrás del muro PRO**, y baseline es uno
// de los cuatro requisitos declarados de este módulo. `frappe-gantt` es la más liviana pero sólo
// soporta fin-a-comienzo y no publica tipos. Además este repo no tiene NI UNA dependencia de UI de
// terceros —sólo Next, React, Supabase, Zod y Tailwind— y ninguna librería del mercado modela
// restricciones, que es lo que hace que este Gantt sirva para algo. Sumar 90 KB y 17 paquetes para
// la primera pantalla del módulo es un cambio de arquitectura, no una elección de componente.
//
// ═══ LAS DECISIONES DE IMPLEMENTACIÓN QUE IMPORTAN ═══
//
// · UN SOLO contenedor con scroll y `position: sticky` para el encabezado y la columna izquierda.
//   Sincronizar dos scrolls por JavaScript es de donde sale el tirón que hace sentir lento un Gantt.
// · La escala se acumula por celda; NUNCA `left = (fecha − inicio) × pxPorDía` sobre meses, porque
//   los meses tienen entre 28 y 31 días.
// · Sin arrastre en esta versión. Un Gantt de lectura rápido y correcto vale más que uno arrastrable
//   y con fechas que se corren solas: mover una barra escribe una fecha, y eso se hace con su
//   confirmación y su registro, en el paso siguiente.
// · Sin virtualizar: la obra más grande tiene 124 actividades. Virtualizar 124 filas es optimización
//   prematura y el precio se paga en bugs de scroll.
//
// ═══ EL COLOR SALE DE LOS TOKENS, Y NO ES COSMÉTICA ═══
//
// Las barras eran `sky-500`/`sky-700` y la línea de hoy `rose`: tres colores que no existen en el
// sistema del OS. El acento es UNO —el grafito de la marca— y el plan y lo ejecutado son el mismo
// color a distinta intensidad, que es lo que deja ver el avance de un vistazo. El rojo y el ámbar
// quedan reservados para lo que está mal (atrasado, frenado) y el amarillo de la marca se usa donde
// el logo lo usa: una regla fina que dice "acá estás" — la línea de hoy. Hoy no es un problema, y
// pintarlo de rojo era decir que sí.

import { useMemo, useState } from 'react'
import { BotonAccion, type ResultadoAccion } from '@/shared/components/ui'
import { agruparActividades, estadoDe, filasVisibles } from '../services/cronograma'
import type { Actividad, Dependencia, Persona, Restriccion } from '../types'
import { FormNuevaActividad, PanelActividad, type AccionesCronograma } from './PanelActividad'

const DIA = 86400000
const ALTO_FILA = 26

type Escala = 'semana' | 'mes'
const PX_POR_DIA: Record<Escala, number> = { semana: 13, mes: 4 }

const aDate = (iso: string) => new Date(iso + 'T00:00:00Z')
const isoDe = (d: Date) => d.toISOString().slice(0, 10)
const fmtCorto = (iso: string | null) =>
  iso ? aDate(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }) : '—'

/**
 * SELLAR LA LÍNEA BASE — la acción con más consecuencias del módulo, y la única que no se deshace.
 *
 * La advertencia va ESCRITA Y VISIBLE, no en un `confirm()` del navegador: un diálogo nativo se
 * cierra con el pulgar sin leerlo, no queda a la vista mientras se decide, y encima obliga a los
 * tests a atrapar el evento. Acá el botón está detrás de un despliegue que dice qué pasa cuando se
 * toca — y una vez sellada, el botón desaparece en lugar de fallar contra el servidor.
 */
function SellarLineaBase({ sellar, yaSellada }: { sellar: () => Promise<ResultadoAccion>; yaSellada: boolean }) {
  if (yaSellada) {
    return <span className="text-[11px] text-faint" data-testid="baseline-sellada">línea base sellada</span>
  }
  return (
    <details className="relative">
      <summary
        data-testid="sellar-baseline"
        className="cursor-pointer rounded-control border border-line px-2.5 py-1 text-[12px] text-ink hover:bg-surface-sunken"
      >Sellar línea base</summary>
      <div className="absolute right-0 z-30 mt-1 w-[280px] rounded-control border border-line bg-surface p-3 shadow-pop">
        <p className="text-[12px] leading-relaxed text-muted">
          Congela las fechas de HOY como el plan aprobado. <strong className="text-ink">Se hace una sola vez</strong>:
          desde entonces, mover una fecha produce un desvío medible. Si se pudiera volver a sellar, cada
          reprogramación dejaría el desvío en cero y el tablero diría que siempre vamos en fecha.
        </p>
        <div className="mt-2.5">
          <BotonAccion accion={() => sellar()} testid="sellar-baseline-confirmar" tono="fuerte">
            Sellar el plan de hoy
          </BotonAccion>
        </div>
      </div>
    </details>
  )
}

/** La escala horizontal: dónde cae cada fecha, y las divisiones que se dibujan arriba. */
function construirEscala(desde: Date, hasta: Date, escala: Escala) {
  const px = PX_POR_DIA[escala]
  const ancho = Math.ceil((hasta.getTime() - desde.getTime()) / DIA) * px
  const x = (iso: string) => ((aDate(iso).getTime() - desde.getTime()) / DIA) * px

  const meses: { label: string; x0: number }[] = []
  const ticks: { label: string; x: number }[] = []
  const cur = new Date(desde)
  cur.setUTCDate(1)
  while (cur < hasta) {
    const x0 = ((cur.getTime() - desde.getTime()) / DIA) * px
    if (x0 > -px) {
      meses.push({ label: cur.toLocaleDateString('es-AR', { month: 'short', year: '2-digit', timeZone: 'UTC' }), x0: Math.max(0, x0) })
    }
    cur.setUTCMonth(cur.getUTCMonth() + 1)
  }
  if (escala === 'semana') {
    const d = new Date(desde)
    d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7)) // primer lunes
    while (d < hasta) {
      ticks.push({ label: String(d.getUTCDate()).padStart(2, '0'), x: x(isoDe(d)) })
      d.setUTCDate(d.getUTCDate() + 7)
    }
  }
  return { px, ancho, x, meses, ticks }
}

export function Gantt({
  actividades,
  restricciones = [],
  dependencias = [],
  hoy = new Date(),
  personas = [],
  acciones,
  yaSellada = false,
  seleccionInicial = null,
}: {
  actividades: Actividad[]
  restricciones?: Restriccion[]
  /** Las precedencias declaradas. Vacío es lo normal hoy: se dibuja sin una sola flecha. */
  dependencias?: Dependencia[]
  hoy?: Date
  /** El plantel elegible como responsable. Sin él, el panel deja el selector vacío y lo dice. */
  personas?: Persona[]
  /** Sin `acciones` el Gantt es de sólo lectura y no dibuja un solo control que no funcione. */
  acciones?: AccionesCronograma
  yaSellada?: boolean
  /** Qué actividad viene abierta de la URL. Sólo el arranque: después la selección es local, porque
   *  escribir la URL en cada clic haría una vuelta al servidor por cada barra que se toca. */
  seleccionInicial?: string | null
}) {
  const [escala, setEscala] = useState<Escala>('semana')
  const [selId, setSelId] = useState<string | null>(seleccionInicial)
  const [creando, setCreando] = useState(false)
  const [colapsados, setColapsados] = useState<ReadonlySet<string>>(new Set())

  // LA SELECCIÓN SE GUARDA POR ID, NO POR OBJETO. Guardando el objeto, después de editar una
  // actividad el panel seguía mostrando los valores viejos: el servidor revalidaba y mandaba filas
  // nuevas, pero el estado local conservaba la copia vieja y parecía que el guardado no había hecho
  // nada. Por id, el panel siempre lee la fila que acaba de llegar.
  const sel = selId ? (actividades.find((a) => a.id === selId) ?? null) : null

  // Las actividades con restricción abierta se marcan en la barra: es lo que conecta el cronograma
  // con el make-ready sin abrir otra pantalla.
  const abiertas = useMemo(() => restricciones.filter((r) => r.estado !== 'liberada'), [restricciones])
  const conRestriccion = useMemo(() => {
    const s = new Set<string>()
    for (const r of abiertas) if (r.actividad_id) s.add(r.actividad_id)
    return s
  }, [abiertas])

  const grupos = useMemo(() => agruparActividades(actividades), [actividades])
  const filas = useMemo(() => filasVisibles(grupos, colapsados), [grupos, colapsados])
  const hoyIso = isoDe(hoy)

  const rango = useMemo(() => {
    let min = Infinity; let max = -Infinity
    for (const a of actividades) {
      if (!a.inicio_plan) continue
      const i = aDate(a.inicio_plan).getTime()
      const f = aDate(a.fin_plan ?? a.inicio_plan).getTime()
      const b0 = a.inicio_base ? aDate(a.inicio_base).getTime() : i
      const b1 = a.fin_base ? aDate(a.fin_base).getTime() : f
      min = Math.min(min, i, b0); max = Math.max(max, f, b1)
    }
    if (min === Infinity) return null
    // Un margen de una semana a cada lado para que la primera barra no nazca pegada al borde.
    return { desde: new Date(min - 7 * DIA), hasta: new Date(max + 7 * DIA) }
  }, [actividades])

  const alternar = (clave: string) =>
    setColapsados((prev) => {
      const s = new Set(prev)
      if (s.has(clave)) s.delete(clave)
      else s.add(clave)
      return s
    })

  // LA BARRA SE ARMA ANTES DEL CORTE POR "SIN FECHAS", y no es un detalle de orden: una obra sin
  // ninguna actividad con fecha es exactamente donde hace falta poder crear la primera. Hasta acá,
  // ese caso devolvía un cartel de aviso y ni un solo control.
  const barra = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-4 rounded-sm bg-accent/25" />plan</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-4 rounded-sm bg-accent" />ejecutado</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-1.5 w-4 rounded-sm bg-line-strong" />línea base</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rotate-45 bg-accent" />hito</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-1 rounded-sm bg-warn" />con impedimento</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-3 w-0.5 bg-marca" />hoy</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {grupos.length > 1 && (
          <button
            type="button"
            onClick={() => setColapsados((p) => (p.size ? new Set() : new Set(grupos.map((g) => g.clave))))}
            data-testid="alternar-grupos"
            className="rounded-control border border-line px-2.5 py-1 text-[12px] text-muted hover:bg-surface-sunken hover:text-ink"
          >{colapsados.size ? 'Expandir todo' : 'Contraer todo'}</button>
        )}
        {acciones && (
          <>
            <button
              type="button"
              onClick={() => setCreando((v) => !v)}
              data-testid="nueva-actividad"
              className="rounded-control border border-line px-2.5 py-1 text-[12px] text-ink hover:bg-surface-sunken"
            >{creando ? 'Cancelar' : '+ Nueva actividad'}</button>
            <SellarLineaBase sellar={acciones.sellar} yaSellada={yaSellada} />
          </>
        )}
        <div className="flex overflow-hidden rounded-control border border-line text-[12px]">
          {(['semana', 'mes'] as Escala[]).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEscala(e)}
              className={`px-3 py-1 capitalize ${escala === e ? 'bg-accent text-white' : 'bg-surface text-muted hover:bg-surface-sunken'}`}
            >{e}</button>
          ))}
        </div>
      </div>
    </div>
  )

  const altaActividad = acciones && creando
    ? (
        <div className="border-b border-line bg-surface-quiet p-3.5" data-testid="alta-actividad">
          <FormNuevaActividad personas={personas} crear={acciones.crear} />
        </div>
      )
    : null

  if (!rango) {
    return (
      <div data-testid="gantt" className="rounded-card border border-line bg-surface">
        {barra}
        {altaActividad}
        <p className="px-4 py-8 text-center text-[13px] text-muted">
          {actividades.length
            ? 'Hay actividades cargadas, pero ninguna tiene fecha: sin fechas no hay cronograma que dibujar.'
            : 'Esta obra todavía no tiene ninguna actividad.'}
        </p>
      </div>
    )
  }

  const { ancho, x, meses, ticks } = construirEscala(rango.desde, rango.hasta, escala)
  const alto = filas.length * ALTO_FILA
  const xHoy = x(hoyIso)
  const hoyVisible = xHoy >= 0 && xHoy <= ancho

  // La fila donde quedó cada actividad, para colgar de ahí las flechas de precedencia. Una actividad
  // dentro de un grupo contraído no está en el mapa: su flecha no se dibuja en vez de apuntar a la
  // fila que le tocó el lugar.
  const filaDe = new Map<string, number>()
  filas.forEach((f, i) => { if (f.tipo === 'actividad') filaDe.set(f.actividad.id, i) })

  return (
    <div data-testid="gantt" className="rounded-card border border-line bg-surface">
      {barra}
      {altaActividad}

      {/* EL PANEL VA AL COSTADO, NO DEBAJO. Lo que se está decidiendo al editar una actividad es su
          fecha CONTRA la de las de al lado: si el cronograma se va de la pantalla para dejar lugar
          al formulario, se edita a ciegas. En el teléfono no hay ancho para las dos cosas y el panel
          sube desde abajo como una hoja, tapando el cronograma en vez de aplastarlo. */}
      <div className="flex flex-col lg:flex-row">
        <div className="relative max-h-[72vh] min-w-0 flex-1 overflow-auto">
          {/* EL ANCHO DE LA COLUMNA FIJA ES RESPONSIVO, Y NO ES UN DETALLE ESTÉTICO (17/08/2026).
              Estaba clavado en 340px por estilo en línea. En un teléfono de 390px el contenedor
              visible mide 348px: la columna de nombres se comía el 97,7% y NO SE VEÍA UNA SOLA BARRA
              —ni la línea de hoy, ni el cronograma— aunque el scroll horizontal funcionara. El Gantt
              es la vista más importante del módulo y el teléfono es el aparato del jefe de obra.
              Ahora: 148px en móvil, 340px de `sm` para arriba, y las columnas de fecha se ocultan en
              pantalla chica porque esa información ya está en la barra. */}
          <div className="flex w-max">
            {/* ── COLUMNA FIJA: la grilla de actividades ───────────────────────────────── */}
            <div className="sticky left-0 z-20 w-[148px] shrink-0 border-r border-line bg-surface sm:w-[340px]">
              <div className="sticky top-0 z-10 flex h-11 items-end gap-2 border-b border-line bg-surface px-3 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-faint">
                <span className="flex-1">Actividad</span>
                <span className="hidden w-11 text-right sm:inline">Inicio</span>
                <span className="hidden w-11 text-right sm:inline">Fin</span>
              </div>
              {filas.map((f) => {
                if (f.tipo === 'grupo') {
                  const g = f.grupo
                  const cerrado = colapsados.has(g.clave)
                  return (
                    <button
                      key={f.clave}
                      type="button"
                      onClick={() => alternar(g.clave)}
                      aria-expanded={!cerrado}
                      data-testid="grupo-cronograma"
                      style={{ height: ALTO_FILA }}
                      className="flex w-full items-center gap-1.5 border-b border-line/60 bg-surface-quiet px-2 text-left hover:bg-surface-sunken"
                    >
                      <span aria-hidden className={`shrink-0 text-[9px] text-muted transition-transform ${cerrado ? '' : 'rotate-90'}`}>▶</span>
                      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink" title={g.nombre}>{g.nombre}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-faint">
                        {g.pct == null ? `${g.hijas.length}` : `${g.pct}%`}
                      </span>
                    </button>
                  )
                }
                const a = f.actividad
                return (
                  <button
                    key={f.clave}
                    type="button"
                    onClick={() => setSelId(a.id)}
                    data-testid="actividad-cronograma"
                    style={{ height: ALTO_FILA }}
                    className={`flex w-full items-center gap-2 border-b border-line/60 px-3 text-left text-[12px] hover:bg-surface-sunken ${sel?.id === a.id ? 'bg-surface-sunken' : ''}`}
                  >
                    <span
                      className="min-w-0 flex-1 truncate pl-3 text-muted"
                      title={[a.seccion, a.codigo, a.nombre].filter(Boolean).join(' · ')}
                    >{a.nombre}</span>
                    <span className="hidden w-11 shrink-0 text-right tabular-nums text-faint sm:inline">{fmtCorto(a.inicio_plan)}</span>
                    <span className="hidden w-11 shrink-0 text-right tabular-nums text-faint sm:inline">{fmtCorto(a.fin_plan)}</span>
                  </button>
                )
              })}
            </div>

            {/* ── LÍNEA DE TIEMPO ──────────────────────────────────────────────────────── */}
            <div className="relative shrink-0" style={{ width: ancho }}>
              <div className="sticky top-0 z-10 h-11 border-b border-line bg-surface">
                <svg width={ancho} height={44} className="block">
                  {meses.map((m) => (
                    <g key={m.label + m.x0}>
                      <line x1={m.x0} y1={0} x2={m.x0} y2={44} className="stroke-line" />
                      <text x={m.x0 + 6} y={16} fontSize={11} className="fill-muted capitalize">{m.label}</text>
                    </g>
                  ))}
                  {ticks.map((t) => (
                    <text key={t.x} x={t.x + 2} y={35} fontSize={9} className="fill-faint">{t.label}</text>
                  ))}
                </svg>
              </div>

              <svg width={ancho} height={alto} className="block">
                <defs>
                  <marker id="flecha-dep" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 z" className="fill-muted" />
                  </marker>
                </defs>

                {meses.map((m) => (
                  <line key={'g' + m.x0} x1={m.x0} y1={0} x2={m.x0} y2={alto} className="stroke-line/70" />
                ))}

                {/* LA LÍNEA DE HOY va en el amarillo de la marca: es el "acá estás" del logo, no un
                    estado. Estaba en rojo, que en este sistema significa problema. */}
                {hoyVisible && (
                  <line x1={xHoy} y1={0} x2={xHoy} y2={alto} className="stroke-marca" strokeWidth={2} data-testid="linea-hoy" />
                )}

                {filas.map((f, i) => {
                  const y = i * ALTO_FILA
                  // ── LA BARRA DEL GRUPO: se DERIVA de sus hijas, porque la fila de resumen del
                  //    tracker no trae fechas. Se dibuja también contraído: es la única manera de
                  //    ver la obra entera de un vistazo sin abrir los doce grupos.
                  if (f.tipo === 'grupo') {
                    const g = f.grupo
                    if (!g.inicio) return null
                    const x0 = x(g.inicio)
                    const w = Math.max(3, x(g.fin ?? g.inicio) - x0)
                    return (
                      <g key={f.clave}>
                        <rect x={x0} y={y + 10} width={w} height={5} rx={1} className="fill-ink" opacity={0.8} />
                        <rect x={x0} y={y + 10} width={3} height={9} className="fill-ink" opacity={0.8} />
                        <rect x={x0 + w - 3} y={y + 10} width={3} height={9} className="fill-ink" opacity={0.8} />
                      </g>
                    )
                  }

                  const a = f.actividad
                  if (!a.inicio_plan) return null
                  const x0 = x(a.inicio_plan)
                  const x1 = x(a.fin_plan ?? a.inicio_plan)
                  const w = Math.max(3, x1 - x0)
                  const frenada = conRestriccion.has(a.id)
                  const atrasada = estadoDe(a, hoyIso) === 'atrasada'
                  return (
                    <g key={f.clave} onClick={() => setSelId(a.id)} className="cursor-pointer">
                      {/* LÍNEA BASE — sólo si está sellada. Sin baseline no se dibuja una sombra en
                          el mismo lugar que el plan: eso haría parecer que el desvío es cero. */}
                      {a.inicio_base && a.fin_base && (
                        <rect x={x(a.inicio_base)} y={y + 18} width={Math.max(3, x(a.fin_base) - x(a.inicio_base))} height={3} rx={1} className="fill-line-strong" />
                      )}
                      {a.tipo === 'hito' ? (
                        <rect x={x0 - 5} y={y + 7} width={10} height={10} className={atrasada ? 'fill-neg' : 'fill-accent'} transform={`rotate(45 ${x0} ${y + 12})`} />
                      ) : (
                        <>
                          <rect x={x0} y={y + 6} width={w} height={12} rx={3} className={atrasada ? 'fill-neg' : 'fill-accent'} opacity={0.22} />
                          {a.pct != null && a.pct > 0 && (
                            <rect x={x0} y={y + 6} width={Math.max(2, (w * Math.min(100, a.pct)) / 100)} height={12} rx={3} className={atrasada ? 'fill-neg' : 'fill-accent'} />
                          )}
                          {frenada && <rect x={x0 - 3} y={y + 4} width={3} height={16} rx={1} className="fill-warn" />}
                        </>
                      )}
                    </g>
                  )
                })}

                {/* ── LAS PRECEDENCIAS. Hoy no hay ninguna declarada en ninguna obra y por eso no se
                    ve una sola flecha: es el estado real del dato, no una función que falta. */}
                {dependencias.map((d) => {
                  const io = filaDe.get(d.origen_id); const id = filaDe.get(d.destino_id)
                  if (io == null || id == null) return null
                  const o = filas[io]; const t = filas[id]
                  if (o.tipo !== 'actividad' || t.tipo !== 'actividad') return null
                  const finO = o.actividad.fin_plan ?? o.actividad.inicio_plan
                  const iniT = t.actividad.inicio_plan
                  if (!finO || !iniT) return null
                  const ox = x(finO); const oy = io * ALTO_FILA + 12
                  const dx = x(iniT); const dy = id * ALTO_FILA + 12
                  const codo = ox + 8
                  return (
                    <path
                      key={d.id}
                      d={`M ${ox} ${oy} H ${codo} V ${dy} H ${dx}`}
                      fill="none"
                      className="stroke-muted"
                      strokeWidth={1}
                      markerEnd="url(#flecha-dep)"
                    />
                  )
                })}
              </svg>
            </div>
          </div>
        </div>

        {sel && (
          acciones
            ? (
                <PanelActividad
                  actividad={sel}
                  personas={personas}
                  acciones={acciones}
                  actividades={actividades}
                  dependencias={dependencias}
                  impedimentos={abiertas.filter((r) => r.actividad_id === sel.id)}
                  alCerrar={() => setSelId(null)}
                />
              )
            : (
                // Sin acciones el panel muestra lo que hay, y NADA que parezca editable: un campo que
                // no persiste es peor que no tenerlo.
                <aside data-testid="panel-actividad" className="w-full shrink-0 border-t border-line bg-surface-quiet px-4 py-3 lg:w-[340px] lg:border-l lg:border-t-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-faint">{[sel.seccion, sel.codigo, sel.tipo].filter(Boolean).join(' · ')}</p>
                      <p className="truncate text-[14px] font-semibold text-ink">{sel.nombre}</p>
                    </div>
                    <button type="button" onClick={() => setSelId(null)} className="shrink-0 text-[12px] text-muted hover:text-ink">cerrar</button>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
                    <div><dt className="text-faint">Plan</dt><dd className="tabular-nums text-ink">{fmtCorto(sel.inicio_plan)} → {fmtCorto(sel.fin_plan)}</dd></div>
                    <div><dt className="text-faint">Línea base</dt><dd className="tabular-nums text-ink">{sel.inicio_base ? `${fmtCorto(sel.inicio_base)} → ${fmtCorto(sel.fin_base)}` : 'sin sellar'}</dd></div>
                    <div><dt className="text-faint">Avance</dt><dd className="tabular-nums text-ink">{sel.pct == null ? '—' : `${sel.pct}%`}</dd></div>
                    <div><dt className="text-faint">Días plan / real</dt><dd className="tabular-nums text-ink">{sel.dias_plan ?? '—'} / {sel.dias_real ?? '—'}</dd></div>
                  </dl>
                </aside>
              )
        )}
      </div>
    </div>
  )
}
