'use client'

import Link from 'next/link'

// ═══ ÍTEMS · `?vista=tareas&sub=arbol` — PORTE LITERAL DE «04» + «04b» (1440) Y «M05» (390) ═══
//
// Una sola pantalla: la TABLA del 04b (Rubro › Épica › Historia › Tarea › Subtarea, con el peso
// por costo de MO y el estado derivado de los partes) y el PANEL del 04 (400px, fondo quiet) que
// se abre al elegir una fila. En el nivel 3 conviven «Ver hasta: Historia · Tarea · Subtarea» del
// 04b y «Agrupar por: Rubro · Responsable · Estado» + «Filtrar actividades» del 04.
//
// En 390 (M05): buscador de 44px + botón de filtros con globo, y la lista por grupo con chevrones;
// la primaria «Nueva actividad» de 48px al pie. El panel se abre a pantalla completa sobre la lista.
//
// ═══ QUÉ SALIÓ (23/09/2026 · fidelidad al diseño) ═══
//
// · El Gantt al lado de la lista y la franja de seis KPI: el diseño no los dibuja acá. El
//   cronograma es `sub=gantt`; las cifras de la obra van en la cabecera (Avance de obra · Costo
//   teórico · Día hábil).
// · Los chips de filtro (Todo · En curso · Crítico · Bloqueadas · …): en el escritorio el 04 no
//   los dibuja; quedan en el cajón de filtros del teléfono (M05), donde el diseño sí pone el botón.
// · El divisor arrastrable: el panel mide 400px.
//
// Buscar, filtrar, plegar, abrir el panel y cambiar de solapa son estado del CLIENTE (<200 ms): el
// material del panel vino en bloque con el árbol y la URL se sincroniza con `replaceState`.

import { useEffect, useMemo, useState } from 'react'
import { CTRL, FormAccion, type AccionFormulario } from '@/shared/components/ui'
import { FormNuevaActividad } from './FormActividad'
import { PanelTarea, type AccionesDelPanel } from './PanelTarea'
import { SubNavTrabajo } from './SubNavTrabajo'
import { C, ESTILO_PRIMARIA, ESTILO_SECUNDARIA } from './canon/tokens'
import { Ico, P } from './canon/Ico'
import { Chip } from './canon/Piezas'
import { rollup, type NodoObra } from '../services/wbs'
import {
  conteoDeVistas, filasVisibles, VISTA_ARBOL_LABEL, VISTAS_PRIMARIAS, VISTAS_SECUNDARIAS, type VistaArbol,
} from '../services/vistaArbol'
import type { AvanceMalImputado, RelacionLegible } from '../services/tareasService'
import type { EquipoEnActividad, NotaActividad } from '../services/recursosService'
import type { PanelDeObra } from '../services/panelObraService'
import type { HistoriaPeso, ResumenDePartes } from '../services/obrasService'
import type { Persona, Restriccion } from '../types'
import { armarContexto, armarVinculacion } from '../services/contextoTarea'
import { resolverSolapa, type Solapa } from '../services/solapasTarea'
import {
  AGRUPAR, agruparFilas, filasDeItems, filtrarPorTexto, VER_HASTA, type Agrupar, type VerHasta,
} from './items/filasDeItems'
import { TablaItems } from './items/TablaItems'
import { ListaItems } from './items/ListaItems'
import { EstadoVacio } from './items/crear/EstadoVacio'
import { Estructura, esModoEstructura, type AccionesEstructura, type DatosEstructura, type ModoEstructura } from './items/crear/Estructura'
import { cifrasDelArbol, publicarCifras } from './items/crear/estadoCabecera'
import { millones, resumenDeEstructura, rotuloProblema, type Ponderaciones } from '../services/estructura'

function dotacionInicial(n: NodoObra, pedida: string | null): number {
  const p = pedida == null ? null : Number(pedida)
  const base = p != null && Number.isInteger(p) && p >= 0 && p <= 99 ? p : Math.max(0, Math.round(n.dotacion_prevista ?? 0))
  return n.tope_frente != null ? Math.min(base, n.tope_frente) : base
}

/** Un conmutador de texto del nivel 3 (04: «Ver hasta Historia · Tarea · Subtarea»). */
function Opciones<T extends string>({ rotulo, opciones, valor, alElegir, testid }: {
  rotulo: string; opciones: readonly { id: T; label: string }[]; valor: T; alElegir: (v: T) => void; testid: string
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }} data-testid={testid}>
      <span style={{ color: C.tenue }}>{rotulo}</span>
      {opciones.map((o) => (
        <button key={o.id} type="button" onClick={() => alElegir(o.id)} aria-pressed={valor === o.id}
          data-testid={`${testid}-${o.id}`} style={{
            border: 'none', background: 'none', padding: 0, font: 'inherit', cursor: 'pointer',
            color: valor === o.id ? C.tinta : C.tintaSuave, fontWeight: valor === o.id ? 500 : 400,
          }}>{o.label}</button>
      ))}
    </span>
  )
}

export function TabTareas({
  obraId, nodos, filtro, cuadrillas, historias, partesResumen, impedimentos,
  panelDeObra, relaciones, docsPorActividad, actInicial, solInicial, dotInicial, malImputados,
  puedeEditar, personas, integrantesPorCuadrilla, nombrePorPersona,
  equiposPorActividad, notasPorActividad, autor, accionesBarra, accionesPanel, nuevaInicial = false,
  nombreObra = null, modo, estructura, accionesEstructura,
}: {
  obraId: string
  nodos: NodoObra[]
  /** C01–C09 (crear la estructura): qué pantalla de armado se mira. */
  modo: ModoEstructura
  estructura: DatosEstructura & { ponds: Ponderaciones; lineaBaseSellada: boolean }
  accionesEstructura: AccionesEstructura
  filtro: VistaArbol
  cuadrillas: { id: string; nombre: string }[]
  historias: HistoriaPeso[]
  partesResumen: ResumenDePartes[]
  /** Los impedimentos ABIERTOS de la obra: el panel dibuja los de su actividad («Lo que la traba»). */
  impedimentos: Restriccion[]
  malImputados: AvanceMalImputado[]
  panelDeObra: PanelDeObra
  relaciones: RelacionLegible[]
  docsPorActividad: Record<string, { id: string; nombre: string; url: string }[]>
  actInicial: string | null
  solInicial: string | null
  dotInicial: string | null
  puedeEditar: boolean
  personas: Persona[]
  integrantesPorCuadrilla: Record<string, string[]>
  nombrePorPersona: Record<string, string>
  equiposPorActividad: Record<string, EquipoEnActividad[]>
  notasPorActividad: Record<string, NotaActividad[]>
  autor: string | null
  accionesBarra: { crearActividad: AccionFormulario; crearRubro: AccionFormulario }
  accionesPanel: AccionesDelPanel
  /** `?nueva=1`: la primaria de la cabecera abre el alta al llegar. */
  nuevaInicial?: boolean
  nombreObra?: string | null
}) {
  const [alta, setAlta] = useState<'' | 'actividad' | 'rubro'>(nuevaInicial && puedeEditar && nodos.length > 0 ? 'actividad' : '')
  // ═══ CREAR LA ESTRUCTURA (C01–C09) ═══
  // Sin trabajo cargado se dibuja la C01 (o, con `?nueva=1`, se arma a mano); con `?crear=`, `&panel=`
  // o `?sel=1` la pantalla de armado reemplaza a la tabla. Las cifras de la cabecera las publica esto.
  const modoEfectivo: ModoEstructura = nodos.length === 0 && nuevaInicial && !esModoEstructura(modo) ? { ...modo, crear: 'mano' } : modo
  const enEstructura = esModoEstructura(modoEfectivo)
  const vacia = nodos.length === 0 && !enEstructura
  useEffect(() => {
    if (!enEstructura && !vacia) return
    const r = resumenDeEstructura(nodos, estructura.ponds)
    publicarCifras(cifrasDelArbol({
      nItems: r.nItems, sinMetodo: r.sinMetodo, sinFechas: r.sinFechas, hhPlan: r.hhPlan, problema: rotuloProblema(r.problemaPonderacion),
      costoMo: millones(r.costoMo), costoTeorico: null, diasHabiles: estructura.obra.diasHabiles,
    }))
  }, [nodos, estructura.ponds, estructura.obra.diasHabiles, enEstructura, vacia])
  const [query, setQuery] = useState('')
  const [verHasta, setVerHasta] = useState<VerHasta>('tarea')
  const [agrupar, setAgrupar] = useState<Agrupar>('rubro')
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)

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
  const abrir = (id: string, s?: Solapa) => { setSel(id); if (s) setSolapa(s); sincronizarUrl({ act: id, sol: s ?? solapa }) }
  const cerrar = () => { setSel(null); sincronizarUrl({ act: null, sol: null, dot: null }) }
  const cambiarSolapa = (s: Solapa) => { setSolapa(s); sincronizarUrl({ sol: s }) }

  const [filtroLocal, setFiltroLocal] = useState<VistaArbol>(filtro)
  const [filtroDeLaUrl, setFiltroDeLaUrl] = useState<VistaArbol>(filtro)
  if (filtro !== filtroDeLaUrl) { setFiltroDeLaUrl(filtro); setFiltroLocal(filtro) }
  const elegirFiltro = (v: VistaArbol) => { setFiltroLocal(v); sincronizarUrl({ filtro: v === 'todo' ? null : v }) }
  const limpiar = () => { setQuery(''); elegirFiltro('todo') }
  const elegirVerHasta = (v: VerHasta) => { setVerHasta(v); sincronizarUrl({ hasta: v === 'tarea' ? null : v }) }
  const elegirAgrupar = (v: Agrupar) => { setAgrupar(v); sincronizarUrl({ agrupar: v === 'rubro' ? null : v }) }

  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const agregados = useMemo(() => rollup(nodos), [nodos])
  const cuentas = useMemo(() => conteoDeVistas(nodos, agregados, hoy), [nodos, agregados, hoy])
  const todas = useMemo(() => filasDeItems(nodos, historias, partesResumen, verHasta), [nodos, historias, partesResumen, verHasta])
  const filas = useMemo(() => {
    let f = todas
    if (filtroLocal !== 'todo') {
      const dentro = new Set(filasVisibles(nodos, agregados, { vista: filtroLocal, query: '', plegados: new Set(), hoy }).map((x) => x.nodo.id))
      f = f.filter((x) => dentro.has(x.id))
    }
    return agruparFilas(filtrarPorTexto(f, query), agrupar)
  }, [todas, filtroLocal, nodos, agregados, hoy, query, agrupar])

  const abierta = sel ? nodos.find((n) => n.id === sel) ?? null : null
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
  const filtrosActivos = (filtroLocal === 'todo' ? 0 : 1) + (query ? 1 : 0)
  const vacio = (
    <>
      {nodos.length === 0 ? 'Esta obra todavía no tiene trabajo cargado.' : query ? `Nada coincide con «${query}».` : 'Ninguna actividad entra en esta vista.'}{' '}
      {(query || filtroLocal !== 'todo') && (
        <button type="button" onClick={limpiar} style={{
          font: 'inherit', color: C.tinta, fontWeight: 500, cursor: 'pointer', textDecoration: 'underline', border: 'none', background: 'none', padding: 0,
        }}>Ver todo</button>
      )}
    </>
  )

  const panel = abierta && (
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
      impedimentos={impedimentos.filter((r) => r.actividad_id === abierta.id)}
      estadoDerivado={filas.find((f) => f.id === abierta.id)?.estado ?? todas.find((f) => f.id === abierta.id)?.estado ?? 'sin_parte'}
      pctDerivado={todas.find((f) => f.id === abierta.id)?.pctItem ?? null}
      rubro={abierta.nivel === 0 ? null : abierta.camino.split(' › ')[0]}
      nombreObra={nombreObra}
    />
  )

  const chips = (
    <>
      {VISTAS_PRIMARIAS.map((v) => (
        <Chip key={v} activo={filtroLocal === v} onClick={() => elegirFiltro(v)} n={String(cuentas[v])}>{VISTA_ARBOL_LABEL[v]}</Chip>
      ))}
      <span aria-hidden data-testid="filete-filtros" style={{ width: '1px', height: '20px', background: C.borde, flexShrink: 0 }} />
      {VISTAS_SECUNDARIAS.map((v) => (
        <Chip key={v} secundario activo={filtroLocal === v} onClick={() => elegirFiltro(v)} n={String(cuentas[v])}>{VISTA_ARBOL_LABEL[v]}</Chip>
      ))}
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <SubNavTrabajo obraId={obraId} sub="arbol"
        derecha={enEstructura || vacia ? undefined :
          <>
            <Opciones rotulo="Ver hasta" opciones={VER_HASTA} valor={verHasta} alElegir={elegirVerHasta} testid="ver-hasta" />
            <span aria-hidden style={{ width: '1px', height: '14px', background: C.borde, margin: '0 4px' }} />
            <Opciones rotulo="Agrupar por" opciones={AGRUPAR} valor={agrupar} alElegir={elegirAgrupar} testid="agrupar-por" />
          </>
        }
        alFinal={vacia || (enEstructura && modoEfectivo.crear !== 'mano') ? undefined : enEstructura ? (
          <>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" data-testid="buscar-tarea"
              style={{ width: '200px', height: '28px', padding: '0 10px', border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', font: 'inherit', fontSize: '12px', background: C.superficie, color: C.tinta }} />
            <span style={{ fontSize: '12px', color: C.tintaSuave, display: 'inline-flex', gap: '5px', alignItems: 'center' }}><Ico d={P.expandir} s={12} />Hasta tarea</span>
          </>
        ) :
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar actividades" data-testid="buscar-tarea"
            style={{
              width: '190px', height: '29px', padding: '0 10px', border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px',
              font: 'inherit', fontSize: '12.5px', background: C.superficie, color: C.tinta,
            }} />
        }
      />

      {alta === 'actividad' && (
        <div className="max-md:mx-4 md:mx-[30px]" style={{ margin: '12px 0', border: `1px solid ${C.borde}`, borderRadius: '10px', background: C.superficie, padding: '12px' }}
          data-testid="alta-actividad">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: C.tinta }}>Nueva actividad</span>
            <button type="button" onClick={() => setAlta('rubro')} data-testid="abrir-alta-rubro" style={{ ...ESTILO_SECUNDARIA, marginLeft: 'auto' }}>
              <Ico d={P.mas} s={13} />Rubro
            </button>
            <button type="button" onClick={() => setAlta('')} aria-label="Cerrar" style={{ border: 'none', background: 'none', color: C.tenue, cursor: 'pointer', display: 'flex', padding: 0 }}>
              <Ico d={P.cerrar} s={15} />
            </button>
          </div>
          <FormNuevaActividad personas={personas} crear={accionesBarra.crearActividad}
            rubros={nodos.filter((n) => n.es_contenedor).map((n) => n.nombre)} />
        </div>
      )}
      {alta === 'rubro' && (
        <div className="max-md:mx-4 md:mx-[30px]" style={{ margin: '12px 0', border: `1px solid ${C.borde}`, borderRadius: '10px', background: C.superficie, padding: '12px' }}
          data-testid="alta-rubro-tareas">
          <FormAccion accion={accionesBarra.crearRubro} testid="form-nuevo-rubro" enviar="Crear rubro" limpiarAlOk mensajeOk="Rubro creado.">
            <input name="nombre" required minLength={2} maxLength={120} className={CTRL} placeholder="Nombre del rubro" />
          </FormAccion>
        </div>
      )}

      {malImputados.length > 0 && (
        <p data-testid="avances-mal-imputados" className="max-md:mx-4 md:mx-[30px]" style={{
          margin: '0 0 10px', borderLeft: `3px solid ${C.warn}`, background: C.warnFondo, padding: '8px 12px', fontSize: '12px', color: C.warn,
        }}>
          {malImputados.length} avance(s) quedaron cargados contra un contenedor antes de que la regla existiera:{' '}
          {malImputados.slice(0, 3).map((m) => m.actividad).join(' · ')}{malImputados.length > 3 ? ' …' : ''}. Hay que reimputarlos a la actividad que corresponde.
        </p>
      )}

      {enEstructura && (
        <Estructura obraId={obraId} nodos={nodos} ponds={estructura.ponds} modo={modoEfectivo} datos={estructura} acciones={accionesEstructura} query={query} />
      )}
      {vacia && (
        <EstadoVacio obraId={obraId} lineaBaseSellada={estructura.lineaBaseSellada} diasHabiles={estructura.obra.diasHabiles}
          plazo={estructura.obra.inicio && estructura.obra.fin ? `${estructura.obra.inicio.slice(8, 10)}/${estructura.obra.inicio.slice(5, 7)} → ${estructura.obra.fin.slice(8, 10)}/${estructura.obra.fin.slice(5, 7)}` : null}
          presupuesto={estructura.presupuesto ? { rotulo: estructura.presupuesto.rotulo, nPartidas: estructura.presupuesto.partidas.length } : null} />
      )}
      {vacia && puedeEditar && (
        <div className="flex md:hidden" style={{ position: 'fixed', left: 0, right: 0, bottom: '64px', padding: '12px 16px 18px', background: C.superficie, borderTop: `1px solid ${C.borde}`, zIndex: 20 }}>
          <Link href={`/obras/${obraId}?vista=tareas&sub=arbol&crear=mano`} prefetch={false} data-testid="primaria-nueva-actividad"
            style={{ ...ESTILO_PRIMARIA, width: '100%', height: '48px', justifyContent: 'center', fontSize: '14px', gap: '8px', color: C.grafito, textDecoration: 'none' }}>
            <Ico d={P.mas} s={15} />Nueva actividad
          </Link>
        </div>
      )}
      {!enEstructura && !vacia && (<>
      {/* ═══ ESCRITORIO: tabla + panel de 400px ═══ */}
      <div className="hidden md:grid" style={{ gridTemplateColumns: abierta ? 'minmax(0,1fr) 400px' : 'minmax(0,1fr)', alignItems: 'start' }}>
        <TablaItems filas={filas} abierta={sel} alAbrir={(id) => abrir(id)} vacio={vacio} />
        {abierta && (
          <aside style={{ borderLeft: `1px solid ${C.borde}`, background: C.tenueFondo, minHeight: '100%', alignSelf: 'stretch' }} data-testid="panel-tarea-marco">
            {panel}
          </aside>
        )}
      </div>

      {/* ═══ TELÉFONO (M05): lista por grupo; el panel tapa la lista ═══ */}
      <div className="md:hidden">
        <ListaItems filas={filas} query={query} alBuscar={setQuery} filtrosActivos={filtrosActivos}
          alAbrirFiltros={() => setFiltrosAbiertos((x) => !x)} alAbrir={(id) => abrir(id)} vacio={vacio} />
        {filtrosAbiertos && (
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: '64px', background: C.superficie, borderTop: `1px solid ${C.borde}`, padding: '12px 16px', zIndex: 25 }}
            data-testid="filtros-telefono">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>{chips}</div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '10px', fontSize: '12px', color: C.tintaSuave, flexWrap: 'wrap' }}>
              <Opciones rotulo="Ver hasta" opciones={VER_HASTA} valor={verHasta} alElegir={elegirVerHasta} testid="ver-hasta-telefono" />
              <Opciones rotulo="Agrupar" opciones={AGRUPAR} valor={agrupar} alElegir={elegirAgrupar} testid="agrupar-telefono" />
            </div>
          </div>
        )}
        {abierta && (
          <div style={{ position: 'fixed', top: '44px', left: 0, right: 0, bottom: '64px', overflowY: 'auto', background: C.tenueFondo, zIndex: 30 }}
            data-testid="panel-tarea-telefono">
            {panel}
          </div>
        )}
        {puedeEditar && !abierta && (
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: '64px', padding: '12px 16px 18px', background: C.superficie, borderTop: `1px solid ${C.borde}`, zIndex: 20 }}>
            <button type="button" onClick={() => { setAlta('actividad'); window.scrollTo({ top: 0 }) }} data-testid="primaria-nueva-actividad"
              style={{ ...ESTILO_PRIMARIA, width: '100%', height: '48px', justifyContent: 'center', fontSize: '14px', gap: '8px', color: C.grafito }}>
              <Ico d={P.mas} s={15} />Nueva actividad
            </button>
          </div>
        )}
      </div>
      </>)}
    </div>
  )
}
