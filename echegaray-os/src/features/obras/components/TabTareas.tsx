'use client'

// ═══ 03 · OBRA TAREAS — PORTE LITERAL DE «03 · Obra Tareas.dc.html» ═══
//
// El mockup arma la pantalla en cuatro bandas, y así está armada acá:
//
//   1. la barra de nivel 3 (`SubNavTrabajo`) con buscador de 222px, los cuatro filtros con su
//      número y el conmutador de dependencias de 28×28;
//   2. la barra de acciones (`padding:10px 20px`): la primaria amarilla, «Rubro», y a la derecha
//      expandir/colapsar como dos íconos;
//   3. UNA SOLA tarjeta blanca que contiene la lista, el divisor arrastrable de 5px y el Gantt —no
//      dos tarjetas hermanas—, y al lado el panel de la tarea con su propio divisor de 12px;
//   4. la franja de seis KPI como tarjeta aparte (`margin:0 20px 20px`).
//
// ═══ LOS TRES CORTES POR ANCHO SON LOS DEL MOCKUP ═══
//
//   `verPanel = w >= 1040` · `verGantt = w >= 1180` · `verFechas = !verGantt`
//
// No son media queries de Tailwind aproximadas: el zip decide con `window.innerWidth` y por eso
// acá se lee el ancho real. Debajo de 1180 la lista se ensancha y RECUPERA la columna PLAZO — el
// dato no se pierde nunca, cambia de lugar.
//
// ═══ QUÉ SALIÓ DE ESTA PANTALLA ═══
//
// · LA SELECCIÓN MÚLTIPLE Y SU BARRA DE LOTE. El canónico no dibuja casillas acá y sí dibuja la
//   pantalla «06 · Avance masivo» entera para eso, con su casilla de 18px y su barra fija. Dos
//   mecanismos para lo mismo terminan contestando distinto; el enlace a la 06 está en la barra.
// · «IMPORTAR COTIZACIÓN». El zip lo dibuja y el OS no tiene hoy ese flujo: un botón muerto es peor
//   que su ausencia. Queda declarado, no silenciado.
//
// Buscar, filtrar, plegar, abrir el panel y cambiar de solapa son estado del CLIENTE (<200 ms): el
// material del panel vino en bloque con el árbol y la URL se sincroniza con `replaceState` para que
// el mismo link siga abriendo la misma tarea. Las escrituras siguen pasando por sus server actions.

import Link from 'next/link'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { CTRL, FormAccion, type AccionFormulario } from '@/shared/components/ui'
import { FormNuevaActividad } from './FormActividad'
import { hh as fmtHH, porcentaje } from './formato'
import { COLS_CON_FECHAS, COLS_SIN_FECHAS, FilaWbs } from './FilaWbs'
import { ALTO_CABECERA, GanttTareas } from './GanttTareas'
import { barraDe, escalaDe, rangoDeObra, t, tramosDeContenedores } from '../services/gantt'
import { PanelTarea, type AccionesDelPanel } from './PanelTarea'
import { SubNavTrabajo } from './SubNavTrabajo'
import { C, ESTILO_PRIMARIA, ESTILO_SECUNDARIA } from './canon/tokens'
import { Ico, P } from './canon/Ico'
import { Buscador, Chip, Tarjeta } from './canon/Piezas'
import { Divisor, IconoBarra, Kpi, KpiDesvio, useDivisores } from './TabTareasPiezas'
import { rollup, totalObra, type NodoObra } from '../services/wbs'
import {
  conteoDeVistas, contenedores, filasVisibles, VISTA_ARBOL_LABEL, VISTAS_PRIMARIAS,
  VISTAS_SECUNDARIAS, type VistaArbol,
} from '../services/vistaArbol'
import type { AvanceMalImputado, RelacionLegible } from '../services/tareasService'
import type { EquipoEnActividad, NotaActividad } from '../services/recursosService'
import type { PanelDeObra } from '../services/panelObraService'
import type { Persona } from '../types'
import { armarContexto, armarVinculacion } from '../services/contextoTarea'
import { resolverSolapa, type Solapa } from '../services/solapasTarea'

/** El ancho de la ventana, sin `setState` dentro de un efecto. El zip decide con `window.innerWidth`
 *  y no con puntos de corte de CSS, así que el ancho tiene que ser un dato de React. */
const suscribirAncho = (cb: () => void) => {
  window.addEventListener('resize', cb)
  return () => window.removeEventListener('resize', cb)
}
const anchoActual = () => window.innerWidth
/** En el servidor no hay ventana: se asume escritorio, que es donde vive esta pantalla. La primera
 *  pintura del navegador corrige el valor sin parpadeo perceptible. */
const anchoServidor = () => 1600

function useAnchoVentana(): number {
  return useSyncExternalStore(suscribirAncho, anchoActual, anchoServidor)
}

/** La dotación con la que arranca la simulación: la prevista del plan, acotada al tope. */
function dotacionInicial(n: NodoObra, pedida: string | null): number {
  const p = pedida == null ? null : Number(pedida)
  const base = p != null && Number.isInteger(p) && p >= 0 && p <= 99
    ? p
    : Math.max(0, Math.round(n.dotacion_prevista ?? 0))
  return n.tope_frente != null ? Math.min(base, n.tope_frente) : base
}

const ROTULO_COL: React.CSSProperties = {
  fontSize: '10px', color: C.tenue, letterSpacing: '.05em', paddingBottom: '9px',
}

export function TabTareas({
  obraId, nodos, filtro, cuadrillas,
  panelDeObra, relaciones, docsPorActividad, actInicial, solInicial, dotInicial, malImputados,
  puedeEditar, personas, integrantesPorCuadrilla, nombrePorPersona,
  equiposPorActividad, notasPorActividad, autor, accionesBarra, accionesPanel,
}: {
  obraId: string
  nodos: NodoObra[]
  filtro: VistaArbol
  cuadrillas: { id: string; nombre: string }[]
  malImputados: AvanceMalImputado[]
  panelDeObra: PanelDeObra
  relaciones: RelacionLegible[]
  docsPorActividad: Record<string, { id: string; nombre: string; url: string }[]>
  actInicial: string | null
  solInicial: string | null
  dotInicial: string | null
  puedeEditar: boolean
  personas: Persona[]
  /** El material del canónico 04: quién integra cada cuadrilla, cómo se llama cada persona, qué
   *  equipos aparecieron en los partes y qué se anotó. Todo por OBRA — cambiar de actividad no
   *  puede costar una consulta. */
  integrantesPorCuadrilla: Record<string, string[]>
  nombrePorPersona: Record<string, string>
  equiposPorActividad: Record<string, EquipoEnActividad[]>
  notasPorActividad: Record<string, NotaActividad[]>
  /** Quién firma el avance que se registre desde el panel. */
  autor: string | null
  accionesBarra: { crearActividad: AccionFormulario; crearRubro: AccionFormulario }
  accionesPanel: AccionesDelPanel
}) {
  const ancho = useAnchoVentana()
  const verPanel = ancho >= 1040
  const verGantt = ancho >= 1180
  const verFechas = !verGantt

  const [alta, setAlta] = useState<'' | 'actividad' | 'rubro'>('')
  const [query, setQuery] = useState('')
  const [plegados, setPlegados] = useState<ReadonlySet<string>>(new Set())
  const [verDeps, setVerDeps] = useState(true)

  // ═══ SELECCIÓN, SOLAPA Y DOTACIÓN: ESTADO CLIENTE CON LA URL DE ESPEJO ═══
  // QUÉ FILA SE ESTÁ EDITANDO. UNA sola: dos filas abiertas a la vez en una lista de 350 es la
  // manera de guardar en la actividad equivocada. No va a la URL — no es un lugar de la pantalla,
  // es un gesto a medio hacer.
  const [editando, setEditando] = useState<string | null>(null)
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
  const limpiar = () => { setQuery(''); elegirFiltro('todo') }

  const agregados = useMemo(() => rollup(nodos), [nodos])
  const total = useMemo(() => totalObra(nodos, agregados), [nodos, agregados])
  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const filas = useMemo(
    () => filasVisibles(nodos, agregados, { vista: filtroLocal, query, plegados, hoy }),
    [nodos, agregados, filtroLocal, query, plegados, hoy],
  )
  const cuentas = useMemo(() => conteoDeVistas(nodos, agregados, hoy), [nodos, agregados, hoy])
  const rango = useMemo(() => rangoDeObra(nodos, hoy), [nodos, hoy])
  const escala = useMemo(() => (rango ? escalaDe(rango, t(hoy)) : null), [rango, hoy])
  const tramos = useMemo(() => tramosDeContenedores(nodos), [nodos])
  const abierta = sel ? nodos.find((n) => n.id === sel) ?? null : null
  // LAS HIJAS MEDIBLES DE UNA AGRUPADORA. El panel las usa para ofrecer un salto en vez de un
  // cartel: sobre un rubro el avance no se registra, pero la actividad donde SÍ se registra queda
  // a un clic. Se calcula sobre el árbol ya aplanado —`camino` empieza con el del padre—, así que
  // sirve para cualquier profundidad, no sólo para las hijas directas.
  const hijasEjecutables = useMemo(() => {
    if (!abierta?.es_contenedor) return []
    const dentro = new Set([abierta.id])
    const salida: { id: string; nombre: string }[] = []
    for (const n of nodos) {
      if (n.padre_id && dentro.has(n.padre_id)) dentro.add(n.id)
      if (!n.es_contenedor && n.padre_id && dentro.has(n.padre_id)) salida.push({ id: n.id, nombre: n.nombre })
    }
    return salida
  }, [abierta, nodos])
  // La franja cuenta sobre TODAS las actividades de la obra, no sobre las visibles: un filtro
  // puesto no cambia cuántas actividades tiene la obra ni cuántos problemas hay abiertos.
  const enCurso = useMemo(
    () => nodos.filter((n) => !n.es_contenedor && n.estado === 'en_curso').length, [nodos],
  )
  const problemas = useMemo(
    () => nodos.reduce((s, n) => s + (n.es_contenedor ? 0 : n.impedimentos_abiertos), 0), [nodos],
  )

  const plegar = (id: string) => setPlegados((p) => {
    const s = new Set(p)
    if (s.has(id)) s.delete(id); else s.add(id)
    return s
  })

  const hayGantt = verGantt && escala != null && filas.length > 0
  const hayPanel = abierta != null && verPanel
  const { anchoTabla, anchoPanel, arrastrando, iniciar } = useDivisores()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <SubNavTrabajo obraId={obraId} sub="arbol" derecha={
        <>
          <Buscador valor={query} alCambiar={setQuery} alLimpiar={limpiar} ancho={222}
            placeholder="Buscar actividad" testid="buscar-tarea" />
          {/* CADA FILTRO DICE CUÁNTO HAY DETRÁS (canónico 03). Las cuatro del diseño primero; las
              otras dos, detrás — se conservan porque contestan preguntas reales de todos los días
              (atrasadas, sin asignar) y no compiten por la mirada con las que resumen la obra. */}
          {[...VISTAS_PRIMARIAS, ...VISTAS_SECUNDARIAS].map((v) => (
            <Chip key={v} activo={filtroLocal === v} onClick={() => elegirFiltro(v)}
              n={String(cuentas[v])}>{VISTA_ARBOL_LABEL[v]}</Chip>
          ))}
          <button type="button" onClick={() => setVerDeps((x) => !x)} title="Dependencias"
            aria-pressed={verDeps} data-testid="conmutar-dependencias"
            style={{
              width: '28px', height: '28px', borderRadius: '6px',
              border: `1px solid ${verDeps ? C.grafito : C.borde}`,
              background: verDeps ? C.grafito : C.superficie,
              color: verDeps ? C.superficie : C.tintaSuave,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
            <Ico d={P.dep} s={15} />
          </button>
        </>
      } />

      {/* ═══ BARRA DE ACCIONES: lo que se HACE a la izquierda; lo que cambia cómo se MIRA, a la
          derecha. Una sola primaria: crear trabajo es lo que se hace acá. ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', flexShrink: 0, flexWrap: 'wrap' }}>
        {puedeEditar && (
          <>
            <button type="button" data-testid="abrir-alta-actividad" style={ESTILO_PRIMARIA}
              onClick={() => setAlta((p) => (p === 'actividad' ? '' : 'actividad'))}>
              <Ico d={P.mas} s={14} w={2.2} />Nueva actividad
            </button>
            <button type="button" data-testid="abrir-alta-rubro" style={ESTILO_SECUNDARIA}
              onClick={() => setAlta((p) => (p === 'rubro' ? '' : 'rubro'))}>
              <Ico d={P.mas} s={14} />Rubro
            </button>
          </>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Link prefetch={false} href={`/obras/${obraId}/avance-masivo`} data-testid="ir-avance-masivo" style={ESTILO_SECUNDARIA}>
            Avance masivo
          </Link>
          <IconoBarra titulo="Expandir todo" testid="expandir" d={P.expandir} onClick={() => setPlegados(new Set())} />
          <IconoBarra titulo="Colapsar todo" testid="colapsar" d={P.colapsar}
            onClick={() => setPlegados(new Set(contenedores(nodos)))} />
        </div>
      </div>

      {alta === 'actividad' && (
        <div style={{ margin: '0 20px 12px', border: `1px solid ${C.borde}`, borderRadius: '10px', background: C.superficie, padding: '12px' }}
          data-testid="alta-actividad">
          <FormNuevaActividad personas={personas} crear={accionesBarra.crearActividad}
            rubros={nodos.filter((n) => n.es_contenedor).map((n) => n.nombre)} />
        </div>
      )}
      {alta === 'rubro' && (
        <div style={{ margin: '0 20px 12px', border: `1px solid ${C.borde}`, borderRadius: '10px', background: C.superficie, padding: '12px' }}
          data-testid="alta-rubro-tareas">
          <FormAccion accion={accionesBarra.crearRubro} testid="form-nuevo-rubro"
            enviar="Crear rubro" limpiarAlOk mensajeOk="Rubro creado.">
            <input name="nombre" required minLength={2} maxLength={120} className={CTRL}
              placeholder="Nombre del rubro" />
          </FormAccion>
        </div>
      )}

      {/* LOS AVANCES CARGADOS CONTRA UN CONTENEDOR NO SE ESCONDEN: trabajo declarado real que quedó
          fuera de todo total. */}
      {malImputados.length > 0 && (
        <p data-testid="avances-mal-imputados" style={{
          margin: '0 20px 10px', borderLeft: `3px solid ${C.warn}`, background: C.warnFondo,
          padding: '8px 12px', fontSize: '12px', color: C.warn,
        }}>
          {malImputados.length} avance(s) quedaron cargados contra un contenedor antes de que la
          regla existiera: {malImputados.slice(0, 3).map((m) => m.actividad).join(' · ')}
          {malImputados.length > 3 ? ' …' : ''}. Hay que reimputarlos a la actividad que corresponde.
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, padding: '0 20px 16px', minHeight: 0 }}>
        <Tarjeta style={{ flex: 1, minWidth: 0, display: 'flex' }}>
          <div style={{
            width: hayGantt ? `${anchoTabla}px` : 'auto',
            flex: hayGantt ? '0 0 auto' : '1',
            minWidth: 0,
          }} data-testid="tabla-wbs">
            <div style={{
              display: 'grid', gridTemplateColumns: verFechas ? COLS_CON_FECHAS : COLS_SIN_FECHAS,
              alignItems: 'end', height: `${ALTO_CABECERA}px`, borderBottom: `1px solid ${C.borde}`,
              background: C.tenueFondo, padding: '0 10px',
            }}>
              <span style={ROTULO_COL}>ACTIVIDAD</span>
              <span style={ROTULO_COL}>ESTADO</span>
              {verFechas && <span style={{ ...ROTULO_COL, textAlign: 'right' }}>PLAZO</span>}
              <span style={{ ...ROTULO_COL, textAlign: 'right' }}>%</span>
            </div>
            {filas.map((f) => (
              <FilaWbs
                key={f.nodo.id}
                fila={f}
                abierta={sel === f.nodo.id}
                verFechas={verFechas}
                alPlegar={() => plegar(f.nodo.id)}
                alAbrir={(s) => abrir(f.nodo.id, s)}
                puedeEditar={puedeEditar}
                alEditar={() => setEditando(f.nodo.id)}
                edicion={editando === f.nodo.id ? {
                  editarCampo: (campo, valor) => accionesPanel.editarCampo(f.nodo.id, campo, valor),
                  cuadrillas,
                  alTerminar: () => setEditando(null),
                } : null}
              />
            ))}
            {filas.length === 0 && (
              <div style={{ padding: '24px 14px', fontSize: '12.5px', color: C.tintaSuave }} data-testid="wbs-vacio">
                {query ? `Nada coincide con «${query}».` : 'Ninguna actividad entra en esta vista.'}{' '}
                <button type="button" onClick={limpiar} style={{
                  color: C.tinta, fontWeight: 500, cursor: 'pointer', textDecoration: 'underline',
                  border: 'none', background: 'none', font: 'inherit', padding: 0,
                }}>Ver todo</button>
              </div>
            )}
          </div>

          {hayGantt && escala && (
            <>
              <Divisor ancho={5} activo={arrastrando === 'tabla'} alArrastrar={iniciar('tabla')}
                titulo="Arrastrar para ensanchar la lista" />
              <GanttTareas
                escala={escala}
                relaciones={relaciones}
                verDeps={verDeps}
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
            </>
          )}
        </Tarjeta>

        {hayPanel && abierta && (
          <>
            <Divisor ancho={12} activo={arrastrando === 'panel'} alArrastrar={iniciar('panel')}
              titulo="Arrastrar para ensanchar el panel" manija />
            <div style={{ width: `${anchoPanel}px`, flexShrink: 0 }}>
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
                integrantesPorCuadrilla={integrantesPorCuadrilla}
                nombrePorPersona={nombrePorPersona}
                equipos={equiposPorActividad[abierta.id] ?? []}
                notas={notasPorActividad[abierta.id] ?? []}
                autor={autor}
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
                hijasEjecutables={hijasEjecutables}
              />
            </div>
          </>
        )}
      </div>

      {/* LA FRANJA DE SEIS KPI (canónico 03): lo que decide si la obra está bien, sin scrollear. */}
      <div data-testid="franja-tareas" style={{
        display: 'flex', gap: 0, margin: '0 20px 20px', background: C.superficie,
        border: `1px solid ${C.borde}`, borderRadius: '10px', overflow: 'hidden', flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        <Kpi t="Avance físico" v={porcentaje(total.avance_pct)} s="sobre HH plan" />
        <Kpi t="HH plan" v={fmtHH(total.hh_plan)} s="" />
        <Kpi t="HH reales" v={fmtHH(total.hh_real)} s="imputadas" />
        <KpiDesvio plan={total.hh_plan} real={total.hh_real} />
        <Kpi t="Actividades" v={String(total.n_actividades)}
          s={[`${enCurso} en curso`, total.n_sin_analisis > 0 ? `${total.n_sin_analisis} sin análisis` : null]
            .filter(Boolean).join(' · ')} />
        <Kpi t="Problemas" v={String(problemas)} s="para resolver"
          color={problemas > 0 ? C.warn : C.pos} />
      </div>
    </div>
  )
}
