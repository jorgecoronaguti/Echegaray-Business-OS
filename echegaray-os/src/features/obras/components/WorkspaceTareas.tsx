// EL WORKSPACE DE TAREAS, CABLEADO — un Server Component que hace LAS lecturas y le entrega al
// cliente todo lo que la pantalla 03 puede llegar a mostrar: el árbol, y el material del panel de
// CUALQUIER actividad.
//
// ═══ EL PANEL DEJÓ DE SER UNA NAVEGACIÓN (23/08/2026 · Design canónico §16) ═══
//
// Hasta hoy abrir una fila era `?act=` → render RSC completo → dos tandas de lecturas: 2-6 s por
// clic, y cerrar otro tanto. El contrato nuevo pide < 200 ms percibidos. La selección, la solapa y
// la dotación simulada pasaron a ser estado del CLIENTE (con la URL sincronizada por
// `replaceState`, así el mismo link sigue abriendo la misma tarea); los datos del panel se leen acá
// EN BLOQUE una vez por obra (`getPanelDeObra`) — los volúmenes son decenas de filas, no miles.
// La base sigue siendo la única fuente: cada escritura pasa por su server action y revalida.

import type { SupabaseClient } from '@supabase/supabase-js'
import { TabTareas } from './TabTareas'
import { getArbol, getAvancesSobreContenedor, getRelaciones } from '../services/tareasService'
import { getPanelDeObra } from '../services/panelObraService'
import { getDocumentos, getHistoriasPeso, getResumenDePartes } from '../services/obrasService'
import { getIntegrantesPorCuadrilla, getPersonas } from '../services/personalService'
import { getEquiposPorActividad, getNotas } from '../services/recursosService'
import { getPerfilActual } from '@/features/auth/services/authService'
import { crearActividad, liberarImpedimento } from '../services/actions'
import type { Restriccion } from '../types'
import { registrarAvance } from '../services/actionsAvance'
import { agregarNota } from '../services/actionsNotas'
import { crearRubro } from '../services/actionsRubro'
import { urlDeDrive } from '../services/driveUrl'
import { esVistaArbol, type VistaArbol } from '../services/vistaArbol'
import { editarCampoDeTarea } from '../services/actionsAvance'
import { cambiarRelacion, dividirEnFrentes, quitarRelacion } from '../services/actionsEstructura'
import { vincularActividadAEstandar } from '../services/actionsVinculacion'
import { getDiasHabilesDeObra } from '../services/obrasService'
import { getEstadosDeSubtareas, getMetodoPonderacion, getPonderaciones, getPresupuestoDeLaObra, hayLineaBase } from '../services/estructuraService'
import { getActivosElegibles, getInsumosDeObra, getPlantillas, getRubrosDeOtrasObras } from '../services/insumosService'
import { agregarInsumo, alternarSubtarea, crearItem, elegirMetodoPonderacion, guardarCostoMO, pedirInsumo, quitarInsumo } from '../services/actionsItem'
import {
  aplicarAccionMasiva, convertirPartidasDesdeLaObra, crearEstructuraDesdePlanilla, guardarPonderacion, guardarSubtareas,
} from '../services/actionsCrear'
import type { ModoEstructura } from './items/crear/Estructura'
import { nombreDePersona } from '../../../shared/personas/nombre.ts'

export async function WorkspaceTareas({
  supabase, obraId, act, filtro, sol, dot, cuadrillas, puedeEditar, veEconomia, nueva = false, abiertas = [],
  nombreObra = null, modo, obra, itemsPonderados = false,
}: {
  supabase: SupabaseClient
  /** C01–C09: qué pantalla de armado se está mirando (`?crear=` · `&panel=` · `?sel=1` · `&nuevo=`). */
  modo: ModoEstructura
  /** El plazo de la obra: lo necesitan la planilla (C03), la conversión (C02) y la ficha nueva (C04). */
  obra: { inicio: string | null; fin: string | null }
  obraId: string
  act: string | undefined
  filtro: string | undefined
  sol: string | undefined
  dot: string | undefined
  cuadrillas: { id: string; nombre: string }[]
  /** Administración o jefatura de obra: decide qué gestos se OFRECEN. Cada acción lo vuelve a
   *  chequear del lado del servidor — la misma escritura entra por otras puertas. */
  puedeEditar: boolean
  /** Quien no ve economía no ve la partida de origen, y la lectura ni se hace. */
  veEconomia: boolean
  /** `?nueva=1`: la primaria «Nueva actividad» de la cabecera llega con el alta abierta. */
  nueva?: boolean
  /** Los impedimentos abiertos de la obra (ya leídos por la página): el panel dibuja los suyos. */
  abiertas?: Restriccion[]
  nombreObra?: string | null
  /** `?vista=items` (04b): la tabla de Ítems ponderados en vez de la de Tareas (04). */
  itemsPonderados?: boolean
}) {
  const vista: VistaArbol = esVistaArbol(filtro) ? filtro : 'todo'
  // ERP OBRAS · H2: el peso de cada historia (`obra_historia_peso`) y lo que dicen los partes de
  // cada ítem (`actividad_partes_resumen`) viajan con el árbol: de ahí salen Pond., % ítem, Avance
  // obra y el ESTADO —derivado, nunca elegido—.
  const [arbolRes, malImputados, relacionesRes, historiasRes, partesRes, pondsRes, diasRes, lineaBase] = await Promise.all([
    getArbol(supabase, obraId),
    getAvancesSobreContenedor(supabase, obraId),
    getRelaciones(supabase, obraId),
    getHistoriasPeso(supabase, obraId),
    getResumenDePartes(supabase, obraId),
    // C04/C05: el peso a mano y el costo de MO por ítem. Una lectura chica; la pagan todas las vistas del árbol.
    getPonderaciones(supabase, obraId),
    getDiasHabilesDeObra(supabase, obraId),
    hayLineaBase(supabase, obraId),
  ])
  // NO EXISTE y NO PUDE LEER son dos cosas distintas: una lista vacía por error dibujada como «no
  // hay nada» hace que un problema de permisos parezca una obra sin trabajo.
  if (arbolRes.error !== null || arbolRes.data === null) {
    return (
      <p className="rounded-lg border border-neg/25 bg-neg-soft px-3.5 py-2.5 text-[13px] text-neg">
        No pude leer la estructura de la obra: {arbolRes.error ?? 'la lectura volvió vacía'}
      </p>
    )
  }
  const arbol = arbolRes.data
  // C01/C02/C04: el presupuesto vinculado se lee sólo cuando se va a dibujar (la obra vacía, la conversión
  // o la ficha nueva); C08: los estados de las subtareas sólo con ese panel abierto.
  // Serie B: el método de la obra y los insumos por tarea (chips del árbol) van siempre con el árbol; el
  // parque de Herramientas y las plantillas sólo cuando se puede agregar una tarea o un insumo.
  const conFormularios = modo.crear === 'mano' || modo.panel === 'subtareas'
  const [presupuestoRes, subtareaEstados, metodo, insumosRes, activosRes, plantillas, rubrosPropuestos] = await Promise.all([
    arbol.length === 0 || modo.crear === 'presupuesto' || modo.crear === 'mano'
      ? getPresupuestoDeLaObra(supabase, obraId) : Promise.resolve(null),
    modo.panel === 'subtareas' && modo.act ? getEstadosDeSubtareas(supabase, obraId, modo.act) : Promise.resolve({}),
    getMetodoPonderacion(supabase, obraId),
    getInsumosDeObra(supabase, obraId),
    conFormularios ? getActivosElegibles(supabase) : Promise.resolve(null),
    modo.crear === 'mano' ? getPlantillas(supabase) : Promise.resolve([]),
    modo.crear === 'mano' && arbol.length === 0 ? getRubrosDeOtrasObras(supabase, obraId) : Promise.resolve([]),
  ])

  // La segunda tanda necesita los ids del árbol; junta el material del panel y los papeles.
  // Las personas sólo se leen si esta cara va a OFRECER el alta: quien no puede crear no necesita
  // el desplegable de responsable, y la lectura ni se hace.
  // ═══ LO QUE EL PANEL 04 MUESTRA DE VERDAD ═══
  //
  // Las tres lecturas nuevas van POR OBRA y no por actividad, igual que el resto del material del
  // panel: cambiar de actividad es un clic y no puede costar una consulta.
  //
  // EL PLANTEL SE LEE SIEMPRE Y NO SÓLO PARA QUIEN EDITA: los avatares de la cuadrilla necesitan
  // ponerle nombre a un `persona_id`, y sin eso el panel dibujaría iniciales «?» —gente afirmada
  // que nadie puede ver—. `persona_plantel` es la ÚNICA puerta al legajo y ya está acotada por sus
  // propias políticas: quien no puede verlo recibe la lista vacía y el panel lo dice.
  const [panel, documentosRes, personasRes, integrantes, equiposPorActividad, notasPorActividad, perfil] =
    await Promise.all([
      getPanelDeObra(supabase, obraId, arbol, veEconomia),
      getDocumentos(supabase, obraId),
      getPersonas(supabase),
      getIntegrantesPorCuadrilla(supabase),
      getEquiposPorActividad(supabase, obraId),
      getNotas(supabase, obraId),
      getPerfilActual(supabase),
    ])
  const nombrePorPersona: Record<string, string> = {}
  for (const p of personasRes.data ?? []) nombrePorPersona[p.id] = nombreDePersona(p)
  const docsPorActividad: Record<string, { id: string; nombre: string; url: string }[]> = {}
  for (const d of documentosRes.data ?? []) {
    if (!d.actividad_id) continue
    ;(docsPorActividad[d.actividad_id] ??= []).push({
      id: d.drive_file_id,
      nombre: d.name ?? d.path ?? d.drive_file_id,
      url: urlDeDrive(d.drive_file_id, d.tipo),
    })
  }

  return (
    <TabTareas
      obraId={obraId}
      nodos={arbol}
      filtro={vista}
      cuadrillas={cuadrillas}
      // LA SELECCIÓN EN LOTE YA NO VIVE EN LA 03 (24/08 · porte literal): el canónico no dibuja
      // casillas en esta lista y sí dibuja la pantalla «06 · Avance masivo» entera para eso.
      // `aplicarEnLote` sigue existiendo y sigue siendo la MISMA acción — la usa la 06.
      malImputados={malImputados}
      historias={historiasRes.data ?? []}
      partesResumen={partesRes.data ?? []}
      impedimentos={abiertas}
      nuevaInicial={nueva}
      nombreObra={nombreObra}
      itemsPonderados={itemsPonderados}
      veEconomia={veEconomia}
      modo={modo}
      estructura={{
        ponds: pondsRes.data ?? {},
        presupuesto: presupuestoRes?.data ?? null,
        presupuestoError: presupuestoRes?.error ?? null,
        obra: { nombre: nombreObra ?? obraId, inicio: obra.inicio, fin: obra.fin, diasHabiles: diasRes.data?.dias_habiles_plan ?? null },
        lineaBaseSellada: lineaBase === true,
        subtareaEstados,
        cuadrillas,
        personas: personasRes.data ?? [],
        avancesPor: Object.fromEntries(Object.entries(panel.historial).map(([k, v]) => [k, v.length])),
        pasosPor: Object.fromEntries(Object.entries(panel.pasos).map(([k, v]) => [k, v.length])),
        metodo,
        insumosPor: insumosRes.data ?? {},
        activos: activosRes?.data ?? [],
        plantillas,
        rubrosPropuestos,
        historiasVista: historiasRes.data ?? [],
      }}
      accionesEstructura={{
        convertir: convertirPartidasDesdeLaObra.bind(null, obraId),
        crearPlanilla: crearEstructuraDesdePlanilla.bind(null, obraId),
        crearItem: crearItem.bind(null, obraId),
        guardarPonderacion: guardarPonderacion.bind(null, obraId),
        dividir: dividirEnFrentes.bind(null, obraId),
        guardarSubtareas: guardarSubtareas.bind(null, obraId),
        aplicarMasiva: aplicarAccionMasiva.bind(null, obraId),
        guardarCosto: guardarCostoMO.bind(null, obraId),
        elegirMetodo: elegirMetodoPonderacion.bind(null, obraId),
        agregarInsumo: agregarInsumo.bind(null, obraId),
        quitarInsumo: quitarInsumo.bind(null, obraId),
        pedirInsumo: pedirInsumo.bind(null, obraId),
        alternarSubtarea: alternarSubtarea.bind(null, obraId),
      }}
      panelDeObra={panel}
      relaciones={relacionesRes.data ?? []}
      docsPorActividad={docsPorActividad}
      actInicial={act ?? null}
      solInicial={sol ?? null}
      dotInicial={dot ?? null}
      puedeEditar={puedeEditar}
      personas={personasRes.data ?? []}
      integrantesPorCuadrilla={integrantes}
      nombrePorPersona={nombrePorPersona}
      equiposPorActividad={Object.fromEntries(equiposPorActividad)}
      notasPorActividad={Object.fromEntries(notasPorActividad)}
      autor={perfil.data?.nombre ?? null}
      // LA BARRA DE ACCIONES DE LA PANTALLA 03: crear trabajo es una función del plan, y hasta hoy
      // sólo se podía desde Cronograma. Son las MISMAS acciones —no hay una segunda alta.
      accionesBarra={{
        crearActividad: crearActividad.bind(null, obraId),
        crearRubro: crearRubro.bind(null, obraId),
      }}
      accionesPanel={{
        editarCampo: editarCampoDeTarea.bind(null, obraId),
        dividir: dividirEnFrentes.bind(null, obraId),
        cambiarRelacion: cambiarRelacion.bind(null, obraId),
        quitarRelacion: quitarRelacion.bind(null, obraId),
        vincularEstandar: vincularActividadAEstandar.bind(null, obraId),
        // LAS MISMAS DOS ACCIONES QUE YA USABAN LA PANTALLA 05 Y EL PANEL DEL CRONOGRAMA. El
        // `actividad_id` lo ata el cliente con otro `.bind`, y cada una vuelve a acotar por
        // `obra_id` del lado del servidor antes de escribir.
        registrarAvance: registrarAvance.bind(null, obraId),
        agregarNota: agregarNota.bind(null, obraId),
        liberarImpedimento: liberarImpedimento.bind(null, obraId),
      }}
    />
  )
}
