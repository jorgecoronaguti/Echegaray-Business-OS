'use client'

// ═══ 03 · OBRA TAREAS — WBS + TIEMPO + PANEL, EL WORKSPACE ÚNICO ═══
//
// Design canónico 23/08: la lista es un árbol constructivo con su carril de tiempo alineado 1:1 y
// el panel de la actividad al lado. ABRIR, CERRAR, CAMBIAR DE ACTIVIDAD O DE SOLAPA ES ESTADO DEL
// CLIENTE (<200 ms): el material del panel vino en bloque con el árbol (`panelObraService`) y la
// URL se sincroniza con `replaceState` para que el mismo link siga abriendo la misma tarea. Las
// escrituras siguen pasando por las server actions, que revalidan y refrescan los props.
//
// El buscador, el plegado y el filtro también son cliente: son 350 filas ya cargadas, y una vuelta
// al servidor por tecla o por clic haría pegajosa la pantalla más usada del módulo.

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Buscador, SubTabs, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { CTRL, FormAccion, type AccionFormulario } from '@/shared/components/ui'
import { FormNuevaActividad } from './FormActividad'
import { hh as fmtHH, porcentaje } from './formato'
import { FilaWbs } from './FilaWbs'
import { BarraTareas, VALOR_INICIAL } from './BarraTareas'
import { escalaDe, GanttTareas, indiceDe, type BarraGantt, type EscalaGantt } from './GanttTareas'
import { PanelTarea, type AccionesDelPanel } from './PanelTarea'
import { rollup, totalObra, type NodoObra } from '../services/wbs'
import {
  contenedores, filasVisibles, VISTA_ARBOL_LABEL, VISTAS_ARBOL,
  type FilaVisible, type VistaArbol,
} from '../services/vistaArbol'
import { seleccionable, type CandidataMasiva, type OperacionMasiva } from '../services/avance'
import type { ResultadoMasivo } from '../services/actionsMasivas'
import type { AvanceMalImputado, RelacionLegible } from '../services/tareasService'
import type { PanelDeObra } from '../services/panelObraService'
import type { Persona } from '../types'
import { armarContexto, armarVinculacion } from '../services/contextoTarea'
import { resolverSolapa, type Solapa } from '../services/solapasTarea'

function candidata(n: NodoObra): CandidataMasiva {
  return {
    id: n.id,
    metodo_avance: n.metodo_avance,
    cantidad_objetivo: n.cantidad_objetivo,
    avance_pct: n.avance_pct,
    es_contenedor: n.es_contenedor,
    es_subcontrato: n.es_subcontrato,
    n_pasos: n.n_pasos,
  }
}

/** La dotación con la que arranca la simulación: la prevista del plan, acotada al tope. */
function dotacionInicial(n: NodoObra, pedida: string | null): number {
  const p = pedida == null ? null : Number(pedida)
  const base = p != null && Number.isInteger(p) && p >= 0 && p <= 99
    ? p
    : Math.max(0, Math.round(n.dotacion_prevista ?? 0))
  return n.tope_frente != null ? Math.min(base, n.tope_frente) : base
}

const DIA = 86_400_000
const t = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)

/** El rango temporal del carril: del primer inicio al último fin de plan, con hoy adentro. */
function rangoDeObra(nodos: readonly NodoObra[], hoy: string): { desde: number; hasta: number } | null {
  let desde = Infinity, hasta = -Infinity
  for (const n of nodos) {
    if (n.inicio_plan) desde = Math.min(desde, t(n.inicio_plan))
    if (n.fin_plan) hasta = Math.max(hasta, t(n.fin_plan))
  }
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta <= desde) return null
  const h = t(hoy)
  return { desde: Math.min(desde, h), hasta: Math.max(hasta, h) + DIA }
}

/** El tramo de un contenedor: del primer inicio al último fin de sus descendientes.
 *  `Agregado` publica `fin_plan` pero NO el inicio, y el corchete del canónico necesita los dos
 *  extremos. Se calcula acá y no se le agrega un campo al rollup: el rollup lo consumen el pie y
 *  la fila, y ninguno de los dos necesita saber cuándo arranca un rubro. */
function tramosDeContenedores(nodos: readonly NodoObra[]): Map<string, { inicio: string; fin: string }> {
  const padre = new Map<string, string | null>(nodos.map((n) => [n.id, n.padre_id]))
  const tramo = new Map<string, { inicio: string; fin: string }>()
  for (const n of nodos) {
    if (n.es_contenedor || !n.inicio_plan || !n.fin_plan) continue
    let id = n.padre_id
    while (id) {
      const p = tramo.get(id)
      tramo.set(id, p
        ? { inicio: n.inicio_plan < p.inicio ? n.inicio_plan : p.inicio, fin: n.fin_plan > p.fin ? n.fin_plan : p.fin }
        : { inicio: n.inicio_plan, fin: n.fin_plan })
      id = padre.get(id) ?? null
    }
  }
  return tramo
}

/** La barra de una fila: la pista es el PLAN y el relleno el avance medido. Pura y testeable.
 *  Sin fechas de plan devuelve null — la fila queda vacía y el Gantt escribe el motivo, porque una
 *  barra inventada desde hoy taparía el único dato que hay: que esa actividad no está planificada. */
function barraDe(
  f: FilaVisible, e: EscalaGantt, hoy: string, tramos: Map<string, { inicio: string; fin: string }>,
): BarraGantt | null {
  const n = f.nodo
  const tr = n.es_contenedor ? tramos.get(n.id) ?? null : null
  const inicio = n.es_contenedor ? tr?.inicio ?? null : n.inicio_plan
  const fin = n.es_contenedor ? tr?.fin ?? null : n.fin_plan
  if (!inicio || !fin) return null
  const dia = indiceDe(inicio, e)
  const dias = Math.max(1, indiceDe(fin, e) - dia + 1)
  // El contenedor no se mide: su barra es el corchete plano del canónico, sin relleno ni %.
  if (n.es_contenedor) {
    return { id: n.id, dia, dias, tono: 'plan', avance: 0, etiqueta: null, resumen: true }
  }
  const av = f.avance
  const hecha = av != null && av >= 100
  const arranco = (av != null && av > 0) || n.estado === 'en_curso'
  const vencida = fin < hoy && !hecha
  const tono = hecha ? 'pos'
    : arranco ? (n.es_critica || vencida ? 'warn' : 'curso')
    : vencida ? 'warn' : 'plan'
  return {
    id: n.id, dia, dias, tono, avance: Math.min(100, Math.max(0, av ?? 0)),
    etiqueta: av != null && av > 0 ? porcentaje(av) : null, resumen: false,
  }
}

export function TabTareas({
  obraId, nodos, filtro, cuadrillas, aplicarEnLote, malImputados,
  panelDeObra, relaciones, docsPorActividad, actInicial, solInicial, dotInicial,
  puedeEditar, personas, accionesBarra, accionesPanel,
}: {
  obraId: string
  nodos: NodoObra[]
  filtro: VistaArbol
  cuadrillas: { id: string; nombre: string }[]
  aplicarEnLote: (form: FormData) => Promise<ResultadoMasivo>
  malImputados: AvanceMalImputado[]
  panelDeObra: PanelDeObra
  relaciones: RelacionLegible[]
  docsPorActividad: Record<string, { id: string; nombre: string; url: string }[]>
  actInicial: string | null
  solInicial: string | null
  dotInicial: string | null
  puedeEditar: boolean
  personas: Persona[]
  /** Crear trabajo desde la pantalla 03. Las mismas acciones del cronograma. */
  accionesBarra: { crearActividad: AccionFormulario; crearRubro: AccionFormulario }
  accionesPanel: AccionesDelPanel
}) {
  const [alta, setAlta] = useState<'' | 'actividad' | 'rubro'>('')
  const [query, setQuery] = useState('')
  const [plegados, setPlegados] = useState<ReadonlySet<string>>(new Set())
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set())
  const [operacion, setOperacion] = useState<OperacionMasiva>('avance')
  const [valores, setValores] = useState<Record<string, string>>({ ...VALOR_INICIAL })

  // ═══ SELECCIÓN, SOLAPA Y DOTACIÓN: ESTADO CLIENTE CON LA URL DE ESPEJO ═══
  const [sel, setSel] = useState<string | null>(actInicial)
  const [solapa, setSolapa] = useState<Solapa>(resolverSolapa(solInicial))
  const [dot, setDot] = useState<Record<string, number>>({})
  const sincronizarUrl = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(window.location.search)
    p.set('vista', 'tareas')
    for (const [k, v] of Object.entries(cambios)) {
      if (v == null) p.delete(k); else p.set(k, v)
    }
    window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`)
  }
  const abrir = (id: string, s?: Solapa) => {
    setSel(id)
    if (s) setSolapa(s)
    sincronizarUrl({ act: id, sol: s ?? solapa })
  }
  const cerrar = () => { setSel(null); sincronizarUrl({ act: null, sol: null, dot: null }) }
  const cambiarSolapa = (s: Solapa) => { setSolapa(s); sincronizarUrl({ sol: s }) }

  // El filtro es estado cliente (22/08): navegarlo re-montaba la página y el skeleton se comía el
  // scroll. La URL sigue siendo compartible.
  const [filtroLocal, setFiltroLocal] = useState<VistaArbol>(filtro)
  const [filtroDeLaUrl, setFiltroDeLaUrl] = useState<VistaArbol>(filtro)
  if (filtro !== filtroDeLaUrl) { setFiltroDeLaUrl(filtro); setFiltroLocal(filtro) }
  const elegirFiltro = (v: VistaArbol) => { setFiltroLocal(v); sincronizarUrl({ filtro: v }) }

  const limpiar = () => { setQuery(''); setMarcadas(new Set()); elegirFiltro('todo') }

  const agregados = useMemo(() => rollup(nodos), [nodos])
  const total = useMemo(() => totalObra(nodos, agregados), [nodos, agregados])
  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const filas = useMemo(
    () => filasVisibles(nodos, agregados, { vista: filtroLocal, query, plegados, hoy }),
    [nodos, agregados, filtroLocal, query, plegados, hoy],
  )
  const rango = useMemo(() => rangoDeObra(nodos, hoy), [nodos, hoy])
  const escala = useMemo(() => (rango ? escalaDe(rango, t(hoy)) : null), [rango, hoy])
  const tramos = useMemo(() => tramosDeContenedores(nodos), [nodos])
  const seleccion = useMemo(
    () => nodos.filter((n) => marcadas.has(n.id)).map(candidata),
    [nodos, marcadas],
  )
  const abierta = sel ? nodos.find((n) => n.id === sel) ?? null : null
  // La franja cuenta sobre TODAS las actividades de la obra, no sobre las visibles: un filtro
  // puesto no cambia cuántas actividades tiene la obra ni cuántos problemas hay abiertos.
  const enCurso = useMemo(
    () => nodos.filter((n) => !n.es_contenedor && n.estado === 'en_curso').length, [nodos],
  )
  const problemas = useMemo(
    () => nodos.reduce((s, n) => s + (n.es_contenedor ? 0 : n.impedimentos_abiertos), 0), [nodos],
  )

  const marcar = (id: string, v: boolean) => setMarcadas((p) => {
    const s = new Set(p)
    if (v) s.add(id); else s.delete(id)
    return s
  })
  const plegar = (id: string) => setPlegados((p) => {
    const s = new Set(p)
    if (s.has(id)) s.delete(id); else s.add(id)
    return s
  })

  return (
    <div className="flex flex-col">
    <div className="flex flex-col gap-3 xl:flex-row">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-3">
          <div className="flex items-center gap-2">
            <Buscador
              value={query}
              onChange={setQuery}
              placeholder="Buscar actividad, frente o partida"
              testid="buscar-tarea"
              className="w-[236px]"
            />
            {query && (
              <>
                <span className="font-mono text-[11px] tabular-nums text-faint">{filas.length} filas</span>
                {/* La ✕ limpia la búsqueda Y la vista: dejar el filtro puesto después de limpiar el
                    texto es la manera de que alguien crea que la obra tiene tres actividades. */}
                <button type="button" onClick={limpiar} data-testid="limpiar-busqueda"
                  className="text-[12px] text-faint hover:text-ink">✕</button>
              </>
            )}
          </div>

          <SubTabs
            testid="filtros-tareas"
            items={VISTAS_ARBOL.map((v) => ({
              onClick: () => elegirFiltro(v), label: VISTA_ARBOL_LABEL[v], activo: filtroLocal === v, testid: `filtro-${v}`,
            }))}
          />

        </div>

        {/* ═══ BARRA DE ACCIONES (design 03) — lo que se HACE, a la izquierda; lo que cambia cómo se
            MIRA, a la derecha. Una sola primaria: crear trabajo es lo que se hace acá.
            «Importar cotización» del mockup NO se dibuja: no existe hoy ese flujo en el OS y un
            botón muerto es peor que su ausencia. ═══ */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 pb-3">
          {puedeEditar && (
            <>
              <button type="button" data-testid="abrir-alta-actividad"
                onClick={() => setAlta((p) => (p === 'actividad' ? '' : 'actividad'))}
                className="rounded-control bg-marca px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:opacity-90">
                + Nueva actividad
              </button>
              <button type="button" data-testid="abrir-alta-rubro"
                onClick={() => setAlta((p) => (p === 'rubro' ? '' : 'rubro'))}
                className="rounded-control border border-line px-3 py-1.5 text-[12.5px] text-ink-soft hover:text-ink">
                Rubro
              </button>
            </>
          )}
          <div className="ml-auto flex items-center gap-3 text-[12.5px]">
            <button type="button" data-testid="expandir" onClick={() => setPlegados(new Set())}
              className="text-muted hover:text-ink">Expandir</button>
            <button type="button" data-testid="colapsar" onClick={() => setPlegados(new Set(contenedores(nodos)))}
              className="text-muted hover:text-ink">Colapsar</button>
            <Link href={`/obras/${obraId}/avance-masivo`} data-testid="ir-avance-masivo"
              className="rounded-control border border-line px-2.5 py-1 text-ink-soft hover:text-ink">
              Avance masivo
            </Link>
          </div>
        </div>

        {alta === 'actividad' && (
          <div className="mb-3 rounded-card border border-line bg-surface-quiet p-3" data-testid="alta-actividad">
            <FormNuevaActividad personas={personas} crear={accionesBarra.crearActividad}
              rubros={nodos.filter((n) => n.es_contenedor).map((n) => n.nombre)} />
          </div>
        )}
        {alta === 'rubro' && (
          <div className="mb-3 rounded-card border border-line bg-surface-quiet p-3" data-testid="alta-rubro-tareas">
            <FormAccion accion={accionesBarra.crearRubro} testid="form-nuevo-rubro"
              enviar="Crear rubro" limpiarAlOk mensajeOk="Rubro creado.">
              <input name="nombre" required minLength={2} maxLength={120} className={CTRL}
                placeholder="Nombre del rubro" />
            </FormAccion>
          </div>
        )}

        {/* LOS AVANCES CARGADOS CONTRA UN CONTENEDOR NO SE ESCONDEN: trabajo declarado real que
            quedó fuera de todo total. */}
        {malImputados.length > 0 && (
          <p data-testid="avances-mal-imputados"
            className="mb-2 border-l-[3px] border-warn bg-warn-soft px-3 py-2 text-[12px] text-warn">
            {malImputados.length} avance(s) quedaron cargados contra un contenedor antes de que la
            regla existiera: {malImputados.slice(0, 3).map((m) => m.actividad).join(' · ')}
            {malImputados.length > 3 ? ' …' : ''}. Hay que reimputarlos a la actividad que corresponde.
          </p>
        )}

        {/* ═══ LA TABLA Y EL GANTT SON HERMANOS, NO PADRE E HIJO (canónico 03) ═══
            El tiempo necesita 24px por día para decir CUÁNDO —dentro de la tabla medía 9px el mes—
            y su propio scroll horizontal, que arrastrando la tabla se llevaría de costado la lista
            que ancla la lectura. La alineación 1:1 la sostiene `h-fila-compacta` en los dos lados.
            Abajo de xl el Gantt no entra: la tabla se ensancha y recupera la columna Plazo. */}
        <div className="flex items-start">
          <div className={`min-w-0 flex-1 ${escala ? 'xl:w-[440px] xl:flex-none 2xl:w-[540px]' : ''}`}>
            <Tabla testid="tabla-wbs" minWidth={340}>
              <THead>
                <Th />
                <Th>Actividad</Th>
                <Th>Estado</Th>
                <Th num className={escala ? 'xl:hidden' : ''}>Plazo</Th>
                <Th num>%</Th>
              </THead>
              <tbody>
                {filas.map((f) => (
                  <FilaWbs
                    key={f.nodo.id}
                    fila={f}
                    abierta={sel === f.nodo.id}
                    seleccionada={marcadas.has(f.nodo.id)}
                    seleccionable={seleccionable(candidata(f.nodo))}
                    alSeleccionar={(v) => marcar(f.nodo.id, v)}
                    alPlegar={() => plegar(f.nodo.id)}
                    alAbrir={(s) => abrir(f.nodo.id, s)}
                    conGantt={escala != null}
                  />
                ))}
                {filas.length === 0 && (
                  <Tr><Td colSpan={5}>
                    <Vacio accion={<button type="button" onClick={limpiar} className="font-medium text-ink hover:underline">Ver todo</button>}>
                      {query ? `Nada coincide con «${query}».` : 'Ninguna actividad entra en esta vista.'}
                    </Vacio>
                  </Td></Tr>
                )}
              </tbody>
            </Tabla>
          </div>

          {escala && filas.length > 0 && (
            <div className="hidden min-w-0 flex-1 xl:flex">
              <GanttTareas
                escala={escala}
                filas={filas.map((f) => {
                  const b = barraDe(f, escala, hoy, tramos)
                  return {
                    id: f.nodo.id,
                    barra: b,
                    motivo: b ? null : 'sin fechas de plan',
                    abierta: sel === f.nodo.id,
                    alAbrir: () => abrir(f.nodo.id),
                  }
                })}
              />
            </div>
          )}
        </div>
      </div>

      {abierta && (
        // STICKY: la lista scrollea, el panel queda a la vista — es un tercio de lo que la
        // pantalla 03 promete, y abajo de xl vuelve a ser un bloque normal.
        <div className="w-full shrink-0 xl:sticky xl:top-14 xl:max-h-[calc(100vh-72px)] xl:w-[412px] xl:self-start xl:overflow-y-auto">
          <PanelTarea
            obraId={obraId}
            nodo={abierta}
            solapa={solapa}
            alCambiarSolapa={cambiarSolapa}
            alCerrar={cerrar}
            alAbrirActividad={(id) => abrir(id)}
            pasos={panelDeObra.pasos[abierta.id] ?? []}
            historial={panelDeObra.historial[abierta.id] ?? []}
            relaciones={relaciones}
            documentos={docsPorActividad[abierta.id] ?? []}
            cuadrillas={cuadrillas}
            contexto={armarContexto(abierta, panelDeObra)}
            vinculacion={armarVinculacion(abierta, panelDeObra)}
            dotacion={dot[abierta.id] ?? dotacionInicial(abierta, sel === actInicial ? dotInicial : null)}
            alCambiarDotacion={(n) => {
              const tope = abierta.tope_frente
              const v = Math.max(0, tope != null ? Math.min(n, tope) : Math.min(n, 99))
              setDot((p) => ({ ...p, [abierta.id]: v }))
              sincronizarUrl({ dot: String(v) })
            }}
            puedeEditar={puedeEditar}
            acciones={accionesPanel}
          />
        </div>
      )}

      <BarraTareas
        seleccion={seleccion}
        cuadrillas={cuadrillas}
        aplicar={aplicarEnLote}
        alLimpiar={() => setMarcadas(new Set())}
        operacion={operacion}
        valor={valores[operacion] ?? ''}
        alElegirOperacion={setOperacion}
        alElegirValor={(v) => setValores((p) => ({ ...p, [operacion]: v }))}
      />
    </div>

    <Franja total={total} enCurso={enCurso} problemas={problemas} />
    </div>
  )
}

/** Una celda de la franja: rótulo chico, número grande, contexto al lado. */
function Metrica({ rotulo, valor, contexto, tono = 'ink' }: {
  rotulo: string; valor: string | null; contexto?: string; tono?: 'ink' | 'warn'
}) {
  return (
    <div className="min-w-0 flex-1 border-r border-line px-4 last:border-0">
      <div className="text-[10px] uppercase tracking-[0.05em] text-faint">{rotulo}</div>
      <p className="flex items-baseline gap-1.5">
        {/* NULL NO ES CERO: «sin cargar» dicho con todas las letras, nunca un 0 que miente. */}
        {valor === null
          ? <span className="text-[12px] text-faint">sin cargar</span>
          : <span className={`font-mono text-[16px] font-semibold tabular-nums ${tono === 'warn' ? 'text-warn' : 'text-ink'}`}>{valor}</span>}
        {contexto && <span className="truncate text-[11px] text-muted">{contexto}</span>}
      </p>
    </div>
  )
}

/** LA FRANJA DE PIE (design 03): lo que decide si la obra está bien, sin scrollear la tabla. */
function Franja({ total, enCurso, problemas }: {
  total: ReturnType<typeof totalObra>; enCurso: number; problemas: number
}) {
  // El desvío existe sólo si existen LOS DOS: contra un plan sin cargar, «+0» sería una mentira.
  const desvio = total.hh_plan != null && total.hh_real != null ? total.hh_real - total.hh_plan : null
  // PEGADA ABAJO: con 300 filas un pie normal sólo se lee al final del scroll, y estos seis
  // números son los que dicen si la obra está bien mientras se mira cualquier tramo del árbol.
  const ctx = [`${enCurso} en curso`, total.n_sin_analisis > 0 ? `${total.n_sin_analisis} sin análisis` : null]
    .filter(Boolean).join(' · ')
  return (
    <div data-testid="franja-tareas"
      className="sticky bottom-0 z-10 mt-3 flex h-14 items-center border-t border-line-strong bg-surface-quiet">
      <Metrica rotulo="Avance físico" valor={porcentaje(total.avance_pct)} contexto="sobre HH plan" />
      <Metrica rotulo="HH plan" valor={fmtHH(total.hh_plan)} />
      <Metrica rotulo="HH reales" valor={fmtHH(total.hh_real)} contexto="imputadas" />
      <Metrica rotulo="Desvío HH" tono={desvio != null && desvio > 0 ? 'warn' : 'ink'}
        valor={desvio == null ? null : `${desvio > 0 ? '+' : ''}${fmtHH(desvio)}`} contexto="vs plan" />
      <Metrica rotulo="Actividades" valor={String(total.n_actividades)} {...(ctx ? { contexto: ctx } : {})} />
      <Metrica rotulo="Problemas" valor={String(problemas)} contexto="para resolver"
        tono={problemas > 0 ? 'warn' : 'ink'} />
    </div>
  )
}
