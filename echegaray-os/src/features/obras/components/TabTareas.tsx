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
import { hh as fmtHH } from './formato'
import { FilaWbs, type CarrilDeFila } from './FilaWbs'
import { BarraTareas, VALOR_INICIAL } from './BarraTareas'
import { PanelTarea, type AccionesDelPanel } from './PanelTarea'
import { rollup, totalObra, type NodoObra } from '../services/wbs'
import {
  contenedores, filasVisibles, VISTA_ARBOL_LABEL, VISTAS_ARBOL, type VistaArbol,
} from '../services/vistaArbol'
import { seleccionable, type CandidataMasiva, type OperacionMasiva } from '../services/avance'
import type { ResultadoMasivo } from '../services/actionsMasivas'
import type { AvanceMalImputado, RelacionLegible } from '../services/tareasService'
import type { PanelDeObra } from '../services/panelObraService'
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

function pct(x: number, r: { desde: number; hasta: number }): number {
  return Math.min(100, Math.max(0, ((x - r.desde) / (r.hasta - r.desde)) * 100))
}

/** El carril de una fila: plan (pista), real hasta hoy, y su tono. Puro, testeable a ojo. */
function carrilDe(
  n: NodoObra, avance: number | null, rango: { desde: number; hasta: number } | null, hoy: string,
): CarrilDeFila | null {
  if (!rango || !n.inicio_plan || !n.fin_plan || n.es_contenedor) return null
  const l = pct(t(n.inicio_plan), rango)
  const w = Math.max(0.8, pct(t(n.fin_plan) + DIA, rango) - l)
  const hecho = avance != null && avance >= 100
  const arranco = (avance != null && avance > 0) || n.estado === 'en_curso'
  const vencida = n.fin_plan < hoy && !hecho
  let real: CarrilDeFila['real'] = null
  if (hecho) real = { l, w, tono: 'pos' }
  else if (arranco) {
    // La barra real que no llegó a su fin se dibuja HASTA HOY, no hasta su fin planificado.
    const wReal = Math.max(0.8, pct(Math.min(t(hoy) + DIA, t(n.fin_plan) + DIA), rango) - l)
    real = { l, w: wReal, tono: vencida ? 'warn' : 'ink' }
  } else if (vencida) real = { l, w: 0.8, tono: 'warn' }
  return { plan: { l, w }, real, hoy: pct(t(hoy) + DIA / 2, rango) }
}

export function TabTareas({
  obraId, nodos, filtro, cuadrillas, aplicarEnLote, malImputados,
  panelDeObra, relaciones, docsPorActividad, actInicial, solInicial, dotInicial,
  puedeEditar, accionesPanel,
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
  accionesPanel: AccionesDelPanel
}) {
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
  const seleccion = useMemo(
    () => nodos.filter((n) => marcadas.has(n.id)).map(candidata),
    [nodos, marcadas],
  )
  const abierta = sel ? nodos.find((n) => n.id === sel) ?? null : null

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

          <div className="ml-auto flex items-center gap-3 text-[12.5px]">
            <button type="button" data-testid="expandir" onClick={() => setPlegados(new Set())}
              className="text-muted hover:text-ink">Expandir</button>
            <button type="button" data-testid="colapsar" onClick={() => setPlegados(new Set(contenedores(nodos)))}
              className="text-muted hover:text-ink">Colapsar</button>
            <Link href={`/obras/${obraId}/avance-masivo`} data-testid="ir-avance-masivo"
              className="rounded-control bg-marca px-2.5 py-1 font-medium text-ink hover:opacity-90">
              Avance masivo
            </Link>
          </div>
        </div>

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

        <Tabla testid="tabla-wbs" minWidth={560}>
          <THead>
            <Th />
            <Th>Estructura de obra</Th>
            <Th num>Cant.</Th>
            <Th>Avance</Th>
            <Th num className="hidden lg:table-cell">Plazo</Th>
            {/* CUADRILLA, no «Responsable»: la columna publica la composición productiva prevista
                (o el subcontratista). El responsable —una persona— vive en el panel. */}
            <Th className="hidden lg:table-cell">Cuadrilla</Th>
            <Th>Estado</Th>
            {/* El carril de tiempo, alineado 1:1 con la fila: plan como pista, real hasta hoy,
                línea amarilla de HOY. El Gantt operable (arrastre, dependencias gráficas) es la
                vista Cronograma; esto es LEER el tiempo sin salir del árbol. */}
            {rango && <Th className="hidden w-[240px] md:table-cell"><CabeceraCarril rango={rango} /></Th>}
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
                carril={rango ? carrilDe(f.nodo, f.avance, rango, hoy) : null}
                conCarril={rango != null}
              />
            ))}
            {filas.length === 0 && (
              <Tr><Td colSpan={8}>
                <Vacio accion={<button type="button" onClick={limpiar} className="font-medium text-ink hover:underline">Ver todo</button>}>
                  {query ? `Nada coincide con «${query}».` : 'Ninguna actividad entra en esta vista.'}
                </Vacio>
              </Td></Tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-strong">
              <td colSpan={8} className="pt-2">
                <span className="flex flex-wrap items-center gap-x-6 gap-y-1">
                  <Pie rotulo="Actividades" valor={String(total.n_actividades)} />
                  <Pie rotulo="HH plan" valor={fmtHH(total.hh_plan) ?? 'sin cargar'} />
                  <Pie rotulo="Sin análisis" valor={String(total.n_sin_analisis)}
                    alerta={total.n_sin_analisis > 0} />
                </span>
              </td>
            </tr>
          </tfoot>
        </Tabla>
      </div>

      {abierta && (
        <div className="w-full shrink-0 xl:w-[412px]">
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
  )
}

/** Los meses del rango, para leer el carril sin adivinar. */
function CabeceraCarril({ rango }: { rango: { desde: number; hasta: number } }) {
  const meses: { l: number; label: string }[] = []
  const d = new Date(rango.desde)
  d.setUTCDate(1)
  while (d.getTime() < rango.hasta) {
    meses.push({
      l: pct(Math.max(d.getTime(), rango.desde), rango),
      label: d.toLocaleDateString('es-AR', { month: 'short', timeZone: 'UTC' }),
    })
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return (
    <span className="relative block h-3 w-full normal-case">
      {meses.map((m) => (
        <span key={m.l} className="absolute top-0 text-[9.5px] font-normal text-faint" style={{ left: `${m.l}%` }}>
          {m.label}
        </span>
      ))}
    </span>
  )
}

function Pie({ rotulo, valor, alerta = false }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[11px] text-faint">{rotulo}</span>
      <span className={`font-mono text-[12px] tabular-nums ${alerta ? 'text-neg' : 'text-ink'}`}>{valor}</span>
    </span>
  )
}
