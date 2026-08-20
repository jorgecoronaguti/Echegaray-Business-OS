'use client'

// EL WORKSPACE DE PLANIFICACIÓN — tabla ↔ divisor ↔ Gantt │ divisor │ panel de la actividad.
//
// ═══ POR QUÉ ES CÓDIGO PROPIO Y NO UNA LIBRERÍA ═══
//
// Se evaluaron las vigentes (agosto 2026). Las dos serias con licencia MIT —`dhtmlx-gantt` 10.x y
// `@svar-ui/react-gantt`— ponen **baseline y camino crítico detrás del muro PRO**, y baseline es uno
// de los cuatro requisitos declarados de este módulo. `frappe-gantt` sólo soporta fin-a-comienzo y
// no publica tipos. Además este repo no tiene NI UNA dependencia de UI de terceros, y ninguna
// librería del mercado modela restricciones — que es lo que hace que este Gantt sirva para algo.
//
// ═══ TRES ZONAS Y DOS DIVISORES (Design Handoff V2) ═══
//
// La misma pantalla sirve para dos trabajos distintos: armar el plan (tabla ancha) y mirar cómo
// viene la obra (calendario ancho). Un reparto fijo elige mal para uno de los dos siempre, así que
// el reparto lo elige quien mira y se guarda en cookie — el servidor la lee y la primera pintura ya
// sale con el ancho correcto (ver `ds/split-servidor.ts`).
//
// ═══ LA ALINEACIÓN NO SE AJUSTA A OJO ═══
//
// Las dos mitades leen `disposicionDeFilas`: la fila `i` de la tabla y la barra `i` del calendario
// caen en el mismo píxel por construcción. El scroll vertical se sincroniza en los dos sentidos y
// el horizontal es sólo del calendario, que es lo único que se extiende más allá de la pantalla.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Divisor, useSplit, Vacio, ZonaSplit } from '@/shared/components/ds'
import { agruparActividades, disposicionDeFilas, filasVisibles } from '../services/cronograma'
import type { Actividad, Dependencia, Persona, Restriccion } from '../types'
import type { ActividadHH } from '../services/personalService'
import { DATOS_VACIOS, PanelActividad, type AccionesCronograma, type DatosDeActividad } from './PanelActividad'
import { construirEscala, type Escala } from '../services/escala'
import { BarraMasiva, type AccionesEnLote } from './AccionesMasivas'
import { CabeceraGantt, CuerpoGantt } from './LienzoGantt'
import { CabeceraTabla, CuerpoTabla, ListaPorFecha } from './TablaActividades'

const DIA = 86400000
const aDate = (iso: string) => new Date(iso + 'T00:00:00Z')
const isoDe = (d: Date) => d.toISOString().slice(0, 10)
/** Sin barra de desplazamiento visible: la tabla y el calendario tienen que medir lo mismo. */
const SIN_BARRA = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

export function Gantt({
  actividades,
  restricciones = [],
  dependencias = [],
  hoy = new Date(),
  personas = [],
  acciones,
  seleccionada,
  alSeleccionar,
  panelAbierto = true,
  alCerrarPanel,
  escala = 'semana',
  masivas,
  hhPorActividad,
  datosPorActividad,
  rubros = [],
  obraId,
  anchoTablaInicial = 470,
  anchoPanelInicial = 452,
}: {
  actividades: Actividad[]
  restricciones?: Restriccion[]
  /** Las precedencias declaradas. Vacío es lo normal hoy: se dibuja sin una sola flecha. */
  dependencias?: Dependencia[]
  hoy?: Date
  /** El plantel elegible como responsable. Sin él, el panel deja el selector vacío y lo dice. */
  personas?: Persona[]
  /** Sin `acciones` el workspace es de sólo lectura y no dibuja un control que no escriba. */
  acciones?: AccionesCronograma
  /** La actividad abierta. Vive en `TabCronograma` porque la barra de vista también la necesita. */
  seleccionada: string | null
  alSeleccionar: (id: string) => void
  panelAbierto?: boolean
  alCerrarPanel?: () => void
  escala?: Escala
  /** Las acciones en lote. Sin ellas NO se dibuja una sola casilla: seleccionar cincuenta filas
   *  para descubrir que no hay nada que hacer con ellas es peor que no poder seleccionarlas. */
  masivas?: AccionesEnLote
  /** HH plan contra real por actividad. Sale de `obra_actividad_hh`, la MISMA vista que lee la
   *  solapa Personal: el Cronograma no recalcula nada, muestra el mismo número. */
  hhPorActividad?: Map<string, ActividadHH>
  /** Partes, tareas, notas, papeles, personal real y equipos de cada actividad, ya indexados. */
  datosPorActividad?: Map<string, DatosDeActividad>
  rubros?: string[]
  obraId?: string
  /** Los anchos que leyó el servidor de la cookie: la primera pintura ya sale bien. */
  anchoTablaInicial?: number
  anchoPanelInicial?: number
}) {
  const [colapsados, setColapsados] = useState<ReadonlySet<string>>(new Set())
  // LA SELECCIÓN EN LOTE VIVE EN EL CLIENTE Y NO VIAJA EN LA URL. Tildar cincuenta casillas serían
  // cincuenta vueltas al servidor, y un enlace compartido resucitaría una selección que el que lo
  // abre no hizo — sobre acciones que escriben.
  const [enLote, setEnLote] = useState<ReadonlySet<string>>(new Set())

  const tabla = useSplit({ clave: 'obra-tabla', inicial: anchoTablaInicial, min: 300, max: 760 })
  const panel = useSplit({ clave: 'obra-panel', inicial: anchoPanelInicial, min: 340, max: 760 })

  // El scroll vertical es UNO solo repartido en dos cajas. El guarda de igualdad corta el rebote:
  // sin él, cada caja contesta el scroll de la otra y la rueda se siente pegajosa.
  const cajaTabla = useRef<HTMLDivElement>(null)
  const cajaLienzo = useRef<HTMLDivElement>(null)
  const sincronizar = (desde: HTMLDivElement | null, hacia: HTMLDivElement | null) => {
    if (!desde || !hacia || hacia.scrollTop === desde.scrollTop) return
    hacia.scrollTop = desde.scrollTop
  }

  // LA SELECCIÓN SE GUARDA POR ID, NO POR OBJETO: guardando el objeto, después de editar una
  // actividad el panel seguía mostrando los valores viejos.
  const sel = seleccionada ? (actividades.find((a) => a.id === seleccionada) ?? null) : null

  const abiertas = useMemo(() => restricciones.filter((r) => r.estado !== 'liberada'), [restricciones])
  const conImpedimento = useMemo(() => {
    const s = new Set<string>()
    for (const r of abiertas) if (r.actividad_id) s.add(r.actividad_id)
    return s
  }, [abiertas])

  const grupos = useMemo(() => agruparActividades(actividades), [actividades])
  const filas = useMemo(() => filasVisibles(grupos, colapsados), [grupos, colapsados])
  const disp = useMemo(() => disposicionDeFilas(filas), [filas])
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
    // Una semana de margen a cada lado: la primera barra no nace pegada al borde.
    return { desde: new Date(min - 7 * DIA), hasta: new Date(max + 7 * DIA) }
  }, [actividades])

  // El ancho libre del calendario se mide: el panel aparece y desaparece, y el lienzo tiene que
  // llenar lo que quede en vez de dibujar las barras apretadas contra el borde izquierdo.
  const cajaCalendario = useRef<HTMLDivElement>(null)
  const [anchoLibre, setAnchoLibre] = useState(0)
  useEffect(() => {
    const caja = cajaCalendario.current
    if (!caja || typeof ResizeObserver === 'undefined') return
    const medir = () => setAnchoLibre(caja.clientWidth)
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(caja)
    return () => obs.disconnect()
  }, [])

  const seleccionables = useMemo(() => grupos.flatMap((g) => g.hijas.map((h) => h.id)), [grupos])
  const idsEnLote = useMemo(() => seleccionables.filter((id) => enLote.has(id)), [seleccionables, enLote])
  const marcar = (ids: string[], puesto: boolean) =>
    setEnLote((prev) => {
      const s = new Set(prev)
      for (const id of ids) { if (puesto) s.add(id); else s.delete(id) }
      return s
    })
  const alternar = (clave: string) =>
    setColapsados((prev) => {
      const s = new Set(prev)
      if (s.has(clave)) s.delete(clave)
      else s.add(clave)
      return s
    })

  const hitos = useMemo(
    () => actividades
      .filter((a) => a.tipo === 'hito' && a.inicio_plan)
      .map((a) => ({ fecha: a.inicio_plan as string, nombre: a.nombre })),
    [actividades],
  )

  const escalaCal = rango ? construirEscala(rango.desde, rango.hasta, escala, anchoLibre) : null
  const finesDeSemana = useMemo(() => {
    if (!rango || !escalaCal || escalaCal.px < 7) return []
    const xs: number[] = []
    const d = new Date(rango.desde)
    let i = 0
    while (d.getTime() < rango.hasta.getTime()) {
      if (d.getUTCDay() === 6) xs.push(i * escalaCal.px)
      d.setUTCDate(d.getUTCDate() + 1); i++
    }
    return xs
  }, [rango, escalaCal])

  const conPanel = panelAbierto && sel !== null

  // ═══ SIN ACTIVIDADES NO SE DIBUJA UN WORKSPACE VACÍO ═══
  //
  // Un encabezado de cinco columnas sobre una grilla en blanco parece una pantalla rota o una obra
  // que no cargó. Lo que hay que decir es que todavía no hay plan, y dónde se empieza — «una línea,
  // accionable» (`COMPONENTS.md` §Empty state). El botón está a la vista, en la barra de arriba: se
  // lo nombra en vez de repetirlo, porque una segunda primaria en la misma pantalla no es una
  // acción más importante, son dos que no se leen.
  if (filas.length === 0) {
    return (
      <div data-testid="gantt" className="flex min-h-0 flex-1 flex-col border-t border-line">
        <Vacio>Todavía no hay ninguna actividad. Se crea con «+ Nueva actividad», arriba a la derecha.</Vacio>
      </div>
    )
  }

  return (
    <div data-testid="gantt" className="flex min-h-0 flex-1 flex-col">
      {masivas && idsEnLote.length > 0 && (
        <BarraMasiva ids={idsEnLote} personas={personas} acciones={masivas} alLimpiar={() => setEnLote(new Set())} />
      )}
      <div className="flex min-h-0 flex-1 border-t border-line">
        {/* EN EL TELÉFONO, LA LISTA POR FECHA. Ver `ListaPorFecha`: el Gantt de barras no se
            mantiene abajo de 768px, y la ficha de la actividad pasa a pantalla completa. El panel
            queda AFUERA de esta partición porque abajo de `lg` no es una columna: es una hoja
            posicionada, y tiene que existir en los dos tamaños. */}
        <div className="min-h-0 flex-1 overflow-y-auto md:hidden">
          <ListaPorFecha filas={filas} seleccionada={seleccionada} alSeleccionar={alSeleccionar} />
        </div>

        <div className="hidden min-h-0 min-w-0 flex-1 md:flex">
        <ZonaSplit>
          <div className="flex min-h-0 flex-1">
            {/* ── LA TABLA ─────────────────────────────────────────────────────────── */}
            <div
              className="flex min-w-0 shrink-0 flex-col lg:[width:var(--ancho-tabla)]"
              style={{ ['--ancho-tabla' as string]: `${tabla.ancho}px` }}
            >
              <CabeceraTabla
                conCasilla={Boolean(masivas)}
                todas={seleccionables.length > 0 && idsEnLote.length === seleccionables.length}
                alMarcarTodas={(v) => marcar(seleccionables, v)}
                compacta={tabla.ancho < 420}
                hayColapsados={colapsados.size > 0}
                {...(grupos.length > 1
                  ? { alAlternarTodos: () => setColapsados((p) => (p.size ? new Set() : new Set(grupos.map((g) => g.clave)))) }
                  : {})}
              />
              <div
                ref={cajaTabla}
                onScroll={() => sincronizar(cajaTabla.current, cajaLienzo.current)}
                className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden ${SIN_BARRA}`}
              >
                <CuerpoTabla
                  filas={filas}
                  disp={disp}
                  seleccionada={seleccionada}
                  alSeleccionar={alSeleccionar}
                  colapsados={colapsados}
                  alAlternar={alternar}
                  compacta={tabla.ancho < 420}
                  {...(masivas ? { enLote, alMarcar: marcar } : {})}
                />
                <div className="h-8" />
              </div>
            </div>

            <Divisor
              testid="divisor-tabla"
              titulo="Arrastrar para repartir el ancho entre la tabla y el calendario"
              arrastrando={tabla.arrastrando}
              setArrastrando={tabla.setArrastrando}
              onArrastre={(dx, fin) => {
                const n = tabla.acotar(tabla.ancho + dx)
                if (fin) tabla.guardar(n)
                else tabla.setAncho(n)
              }}
            />

            {/* ── EL CALENDARIO ────────────────────────────────────────────────────── */}
            <div ref={cajaCalendario} className={`flex min-w-0 flex-1 flex-col overflow-x-auto ${SIN_BARRA}`}>
              {escalaCal ? (
                <div className="flex min-h-0 flex-1 flex-col" style={{ width: escalaCal.ancho, minWidth: '100%' }}>
                  <CabeceraGantt escala={escalaCal} hoyIso={hoyIso} hitos={hitos} />
                  <div
                    ref={cajaLienzo}
                    onScroll={() => sincronizar(cajaLienzo.current, cajaTabla.current)}
                    className={`min-h-0 flex-1 overflow-y-auto ${SIN_BARRA}`}
                  >
                    <CuerpoGantt
                      d={{
                        filas, disp, escala: escalaCal, finesDeSemana, hoyIso,
                        seleccionada, alSeleccionar, dependencias, conImpedimento,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <p className="px-4 pt-16 text-center text-[13px] text-muted" data-testid="gantt-sin-fechas">
                  {actividades.length
                    ? 'Hay actividades cargadas, pero ninguna tiene fecha: sin fechas no hay cronograma que dibujar.'
                    : 'Todavía no hay ninguna actividad.'}
                </p>
              )}
            </div>
          </div>
        </ZonaSplit>
        </div>

        {/* ── EL PANEL DE LA ACTIVIDAD ─────────────────────────────────────────────── */}
        {conPanel && (
          <Divisor
            testid="divisor-panel"
            titulo="Arrastrar para cambiar el ancho del panel"
            arrastrando={panel.arrastrando}
            setArrastrando={panel.setArrastrando}
            onArrastre={(dx, fin) => {
              // El panel crece hacia la IZQUIERDA: el delta va restado.
              const n = panel.acotar(panel.ancho - dx)
              if (fin) panel.guardar(n)
              else panel.setAncho(n)
            }}
          />
        )}
        {conPanel && sel && (
          <PanelActividad
            actividad={sel}
            personas={personas}
            ancho={panel.ancho}
            hh={hhPorActividad?.get(sel.id)}
            datos={datosPorActividad?.get(sel.id) ?? DATOS_VACIOS}
            rubros={rubros}
            {...(obraId ? { obraId } : {})}
            {...(acciones ? { acciones } : {})}
            actividades={actividades}
            dependencias={dependencias}
            // TODOS los de esta actividad, no sólo los abiertos: el panel cuenta los ya resueltos, y
            // eso es la diferencia entre «no hay problemas» y «hubo tres».
            impedimentos={restricciones.filter((r) => r.actividad_id === sel.id)}
            hoy={hoy}
            alCerrar={() => alCerrarPanel?.()}
          />
        )}
      </div>
    </div>
  )
}
