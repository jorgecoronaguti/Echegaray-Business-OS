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
// · Sin virtualizar: la obra más grande tiene 119 actividades. Virtualizar 119 filas es optimización
//   prematura y el precio se paga en bugs de scroll.

import { useMemo, useState } from 'react'
import { BotonAccion, type ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, Persona, Restriccion } from '../types'
import { FormNuevaActividad, PanelActividad, type AccionesCronograma } from './PanelActividad'

const DIA = 86400000
const ALTO_FILA = 26

type Escala = 'semana' | 'mes'
const PX_POR_DIA: Record<Escala, number> = { semana: 13, mes: 4 }

const aDate = (iso: string) => new Date(iso + 'T00:00:00Z')
const isoDe = (d: Date) => d.toISOString().slice(0, 10)
const fmtCorto = (iso: string | null) =>
  iso ? aDate(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }) : '—'

/** Nivel de anidamiento para sangrar: por el código cuando de verdad es un código WBS (`2.03`
 *  cuelga de `2`), y si no —la mayoría de las filas del tracker no llevan número— por si la
 *  actividad pertenece a una sección. Es sangría, nada más: no decide ni identidad ni cálculo. */
function nivelDe(a: Actividad): number {
  if (a.codigo) return Math.min(3, a.codigo.replace(',', '.').split('.').length - 1)
  return a.tipo === 'resumen' ? 0 : 1
}

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
        className="cursor-pointer rounded-control border border-line px-2.5 py-1 text-[12px] text-ink hover:bg-slate-50"
      >Sellar línea base</summary>
      <div className="absolute right-0 z-30 mt-1 w-[280px] rounded-control border border-line bg-white p-3 shadow-lg">
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

export function Gantt({
  actividades,
  restricciones = [],
  hoy = new Date(),
  personas = [],
  acciones,
  yaSellada = false,
}: {
  actividades: Actividad[]
  restricciones?: Restriccion[]
  hoy?: Date
  /** El plantel elegible como responsable. Sin él, el panel deja el selector vacío y lo dice. */
  personas?: Persona[]
  /** Sin `acciones` el Gantt es de sólo lectura y no dibuja un solo control que no funcione. */
  acciones?: AccionesCronograma
  yaSellada?: boolean
}) {
  const [escala, setEscala] = useState<Escala>('semana')
  const [selId, setSelId] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)

  // LA SELECCIÓN SE GUARDA POR ID, NO POR OBJETO. Guardando el objeto, después de editar una
  // actividad el panel seguía mostrando los valores viejos: el servidor revalidaba y mandaba filas
  // nuevas, pero el estado local conservaba la copia vieja y parecía que el guardado no había hecho
  // nada. Por id, el panel siempre lee la fila que acaba de llegar.
  const sel = selId ? (actividades.find((a) => a.id === selId) ?? null) : null

  // Las actividades con restricción abierta se marcan en la barra: es lo que conecta el cronograma
  // con el make-ready sin abrir otra pantalla.
  const conRestriccion = useMemo(() => {
    const s = new Set<string>()
    for (const r of restricciones) if (r.estado !== 'liberada' && r.actividad_id) s.add(r.actividad_id)
    return s
  }, [restricciones])

  const conFecha = useMemo(() => actividades.filter((a) => a.inicio_plan), [actividades])

  const rango = useMemo(() => {
    if (!conFecha.length) return null
    let min = Infinity; let max = -Infinity
    for (const a of conFecha) {
      const i = aDate(a.inicio_plan!).getTime()
      const f = aDate(a.fin_plan ?? a.inicio_plan!).getTime()
      const b0 = a.inicio_base ? aDate(a.inicio_base).getTime() : i
      const b1 = a.fin_base ? aDate(a.fin_base).getTime() : f
      min = Math.min(min, i, b0); max = Math.max(max, f, b1)
    }
    // Un margen de una semana a cada lado para que la primera barra no nazca pegada al borde.
    return { desde: new Date(min - 7 * DIA), hasta: new Date(max + 7 * DIA) }
  }, [conFecha])

  // LA BARRA SE ARMA ANTES DEL CORTE POR "SIN FECHAS", y no es un detalle de orden: una obra sin
  // ninguna actividad con fecha es exactamente donde hace falta poder crear la primera. Hasta acá,
  // ese caso devolvía un cartel de aviso y ni un solo control.
  const barra = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-4 rounded-sm bg-sky-500" />plan</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-4 rounded-sm bg-sky-700" />ejecutado</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-1.5 w-4 rounded-sm bg-slate-300" />línea base</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rotate-45 bg-slate-700" />hito</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-1 rounded-sm bg-amber-500" />con impedimento</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {acciones && (
          <>
            <button
              type="button"
              onClick={() => setCreando((v) => !v)}
              data-testid="nueva-actividad"
              className="rounded-control border border-line px-2.5 py-1 text-[12px] text-ink hover:bg-slate-50"
            >{creando ? 'Cancelar' : '+ Nueva actividad'}</button>
            <SellarLineaBase sellar={acciones.sellar} yaSellada={yaSellada} />
          </>
        )}
        <div className="flex overflow-hidden rounded-md border border-line text-[12px]">
          {(['semana', 'mes'] as Escala[]).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEscala(e)}
              className={`px-3 py-1 capitalize ${escala === e ? 'bg-slate-900 text-white' : 'bg-white text-muted hover:bg-slate-50'}`}
            >{e}</button>
          ))}
        </div>
      </div>
    </div>
  )

  const altaActividad = acciones && creando
    ? (
        <div className="border-b border-line bg-slate-50/70 p-3.5" data-testid="alta-actividad">
          <FormNuevaActividad personas={personas} crear={acciones.crear} />
        </div>
      )
    : null

  if (!rango) {
    return (
      <div data-testid="gantt" className="rounded-xl border border-line bg-white">
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

  const px = PX_POR_DIA[escala]
  const totalDias = Math.ceil((rango.hasta.getTime() - rango.desde.getTime()) / DIA)
  const ancho = totalDias * px
  const x = (iso: string) => ((aDate(iso).getTime() - rango.desde.getTime()) / DIA) * px

  // Encabezado: meses arriba, y abajo la semana (lunes) o el mes según la escala.
  const meses: { label: string; x0: number; x1: number }[] = []
  const ticks: { label: string; x: number }[] = []
  {
    const cur = new Date(rango.desde)
    cur.setUTCDate(1)
    while (cur < rango.hasta) {
      const sig = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1))
      const x0 = Math.max(0, ((cur.getTime() - rango.desde.getTime()) / DIA) * px)
      const x1 = Math.min(ancho, ((sig.getTime() - rango.desde.getTime()) / DIA) * px)
      if (x1 > 0) meses.push({ label: cur.toLocaleDateString('es-AR', { month: 'short', year: '2-digit', timeZone: 'UTC' }), x0, x1 })
      cur.setUTCMonth(cur.getUTCMonth() + 1)
    }
    if (escala === 'semana') {
      const d = new Date(rango.desde)
      d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7)) // primer lunes
      while (d < rango.hasta) {
        ticks.push({ label: String(d.getUTCDate()).padStart(2, '0'), x: x(isoDe(d)) })
        d.setUTCDate(d.getUTCDate() + 7)
      }
    }
  }
  const xHoy = x(isoDe(hoy))
  const hoyVisible = xHoy >= 0 && xHoy <= ancho

  return (
    <div data-testid="gantt" className="rounded-xl border border-line bg-white">
      {barra}
      {altaActividad}

      {/* EL PANEL VA AL COSTADO, NO DEBAJO. Lo que se está decidiendo al editar una actividad es su
          fecha CONTRA la de las de al lado: si el cronograma se va de la pantalla para dejar lugar
          al formulario, se edita a ciegas. En el teléfono no hay ancho para las dos cosas y el
          panel pasa abajo, que es la única manera de que ninguna de las dos se recorte. */}
      <div className="flex flex-col lg:flex-row">
      <div className="relative max-h-[70vh] min-w-0 flex-1 overflow-auto">
        {/* EL ANCHO DE LA COLUMNA FIJA ES RESPONSIVO, Y NO ES UN DETALLE ESTÉTICO (17/08/2026).
            Estaba clavado en 340px por estilo en línea. En un teléfono de 390px el contenedor
            visible mide 348px: la columna de nombres se comía el 97,7% y NO SE VEÍA UNA SOLA BARRA
            —ni la línea de hoy, ni el cronograma— aunque el scroll horizontal funcionara. El Gantt
            es la vista más importante del módulo y el teléfono es el aparato del jefe de obra.
            Ahora: 148px en móvil, 340px de `sm` para arriba, y las columnas de fecha se ocultan en
            pantalla chica porque esa información ya está en la barra. */}
        <div className="flex w-max">
          {/* ── COLUMNA FIJA: la grilla de actividades ───────────────────────────────── */}
          <div className="sticky left-0 z-20 w-[148px] shrink-0 border-r border-line bg-white sm:w-[340px]">
            <div className="sticky top-0 z-10 flex h-11 items-end gap-2 border-b border-line bg-white px-3 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-faint">
              <span className="flex-1">Actividad</span>
              <span className="hidden w-11 text-right sm:inline">Inicio</span>
              <span className="hidden w-11 text-right sm:inline">Fin</span>
            </div>
            {actividades.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelId(a.id)}
                style={{ height: ALTO_FILA }}
                className={`flex w-full items-center gap-2 border-b border-line/60 px-3 text-left text-[12px] hover:bg-sky-50/60 ${sel?.id === a.id ? 'bg-sky-50' : ''}`}
              >
                <span
                  className={`min-w-0 flex-1 truncate ${a.tipo === 'resumen' ? 'font-semibold text-ink' : 'text-muted'}`}
                  style={{ paddingLeft: nivelDe(a) * 12 }}
                  title={[a.seccion, a.codigo, a.nombre].filter(Boolean).join(' · ')}
                >{a.nombre}</span>
                <span className="hidden w-11 shrink-0 text-right tabular-nums text-faint sm:inline">{fmtCorto(a.inicio_plan)}</span>
                <span className="hidden w-11 shrink-0 text-right tabular-nums text-faint sm:inline">{fmtCorto(a.fin_plan)}</span>
              </button>
            ))}
          </div>

          {/* ── LÍNEA DE TIEMPO ──────────────────────────────────────────────────────── */}
          <div className="relative shrink-0" style={{ width: ancho }}>
            <div className="sticky top-0 z-10 h-11 border-b border-line bg-white">
              <svg width={ancho} height={44} className="block">
                {meses.map((m) => (
                  <g key={m.label + m.x0}>
                    <line x1={m.x0} y1={0} x2={m.x0} y2={44} stroke="#e2e8f0" />
                    <text x={m.x0 + 6} y={16} fontSize={11} fill="#64748b" className="capitalize">{m.label}</text>
                  </g>
                ))}
                {ticks.map((t) => (
                  <text key={t.x} x={t.x + 2} y={35} fontSize={9} fill="#94a3b8">{t.label}</text>
                ))}
              </svg>
            </div>

            <svg width={ancho} height={actividades.length * ALTO_FILA} className="block">
              {meses.map((m) => (
                <line key={'g' + m.x0} x1={m.x0} y1={0} x2={m.x0} y2={actividades.length * ALTO_FILA} stroke="#f1f5f9" />
              ))}
              {hoyVisible && (
                <line x1={xHoy} y1={0} x2={xHoy} y2={actividades.length * ALTO_FILA} stroke="#f43f5e" strokeWidth={1} strokeDasharray="3 3" />
              )}
              {actividades.map((a, i) => {
                const y = i * ALTO_FILA
                if (!a.inicio_plan) return null
                const x0 = x(a.inicio_plan)
                const x1 = x(a.fin_plan ?? a.inicio_plan)
                const w = Math.max(3, x1 - x0)
                const frenada = conRestriccion.has(a.id)
                return (
                  <g key={a.id} onClick={() => setSelId(a.id)} className="cursor-pointer">
                    {/* LÍNEA BASE — sólo si está sellada. Sin baseline no se dibuja una sombra en
                        el mismo lugar que el plan: eso haría parecer que el desvío es cero. */}
                    {a.inicio_base && a.fin_base && (
                      <rect x={x(a.inicio_base)} y={y + 17} width={Math.max(3, x(a.fin_base) - x(a.inicio_base))} height={4} rx={2} fill="#cbd5e1" />
                    )}
                    {a.tipo === 'hito' ? (
                      <rect x={x0 - 5} y={y + 7} width={10} height={10} fill="#334155" transform={`rotate(45 ${x0} ${y + 12})`} />
                    ) : a.tipo === 'resumen' ? (
                      <rect x={x0} y={y + 9} width={w} height={6} rx={1} fill="#1e293b" opacity={0.75} />
                    ) : (
                      <>
                        <rect x={x0} y={y + 6} width={w} height={12} rx={3} fill="#0ea5e9" opacity={0.28} />
                        {a.pct != null && a.pct > 0 && (
                          <rect x={x0} y={y + 6} width={Math.max(2, (w * Math.min(100, a.pct)) / 100)} height={12} rx={3} fill="#0369a1" />
                        )}
                        {frenada && <rect x={x0 - 2} y={y + 4} width={3} height={16} rx={1} fill="#f59e0b" />}
                      </>
                    )}
                  </g>
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
                alCerrar={() => setSelId(null)}
              />
            )
          : (
              // Sin acciones el panel muestra lo que hay, y NADA que parezca editable: un campo que
              // no persiste es peor que no tenerlo.
              <aside data-testid="panel-actividad" className="w-full shrink-0 border-t border-line bg-slate-50/70 px-4 py-3 lg:w-[330px] lg:border-l lg:border-t-0">
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
