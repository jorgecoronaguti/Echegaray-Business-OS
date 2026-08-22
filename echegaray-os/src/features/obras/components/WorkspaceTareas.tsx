// EL WORKSPACE DE TAREAS, CABLEADO — un Server Component que hace SUS lecturas y arma sus dos
// piezas: la tabla del árbol (03) y, si hay una actividad abierta, su panel de siete solapas (04).
//
// Vive acá y no en `page.tsx` por una razón medible: la página de la obra ya tenía 554 líneas —por
// encima del tope de 500 del repositorio— y sumarle las diez lecturas de este workspace la dejaba
// en 617. Cada solapa que se cablea adentro de la página hace más difícil ver qué pide cada una.
//
// EL PANEL SE ARMA EN EL SERVIDOR y baja como `children`: sus solapas son tres lecturas más, y
// traerlas al cliente por cada clic sería traerlas por cada clic.
//
// LAS LECTURAS DEL PANEL SÓLO CORREN CON EL PANEL ABIERTO. Son datos de UNA actividad: pedirlos
// junto con la lista sería pagarlos 350 veces para mostrar uno.

import type { SupabaseClient } from '@supabase/supabase-js'
import { TabTareas } from './TabTareas'
import { PanelTarea, esSolapa, type Solapa } from './PanelTarea'
import {
  getArbol, getAvancesSobreContenedor, getHistorial, getPasos, getRelaciones,
} from '../services/tareasService'
import { getContextoTarea, type ContextoTarea } from '../services/panelTareaService'
import { getVinculacionTarea, type VinculacionTarea } from '../services/vinculacionTareaService'
import { esVistaArbol, type VistaArbol } from '../services/vistaArbol'
import { aplicarEnLote, editarCampoDeTarea } from '../services/actionsAvance'
import { cambiarRelacion, dividirEnFrentes, quitarRelacion } from '../services/actionsEstructura'
import { vincularActividadAEstandar } from '../services/actionsVinculacion'

/** El contexto que se dibuja cuando ninguna de sus lecturas pudo correr: todo en null y ninguna
 *  afirmación. La pantalla dice «sin dato» por cada cosa, que es exactamente lo que pasa. */
const CONTEXTO_VACIO: ContextoTarea = {
  jornadaHoras: null, diasHabiles: null, capacidadCuadrilla: null, partida: null,
  puedeVerPartida: false, historico: null, diasHastaFinPlan: null,
}

/** Sin panel abierto no hay actividad que vincular. `no_aplica` y no `sin_vincular`: el default
 *  visible es «sin vincular» para una TAREA, y acá no hay ninguna. */
const VINCULACION_VACIA: VinculacionTarea = { estado: 'no_aplica', sugerencia: null, opciones: [] }

/** `?dot=` — la dotación simulada, acotada a 0–99. Es la misma lectura que la 08: un `dot=99999`
 *  desde la barra de direcciones no puede hacer que el panel dibuje un plantel imposible. Sin
 *  parámetro arranca en la dotación prevista del plan, que es contra lo que se quiere comparar. */
function dotacionDe(raw: string | undefined, prevista: number | null, tope: number | null): number {
  const pedida = raw === undefined ? null : Number(raw)
  const base = pedida != null && Number.isInteger(pedida) && pedida >= 0 && pedida <= 99
    ? pedida
    : Math.max(0, Math.round(prevista ?? 0))
  // El tope del frente no es decorativo: recorta también lo que entra por la URL, igual que en la
  // 08 — el stepper ya lo respeta, pero la URL entra sin pasar por el stepper.
  return tope != null ? Math.min(base, tope) : base
}

export async function WorkspaceTareas({
  supabase, obraId, act, filtro, sol, dot, cuadrillas, puedeEditar, veEconomia,
}: {
  supabase: SupabaseClient
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
}) {
  const vista: VistaArbol = esVistaArbol(filtro) ? filtro : 'todo'
  // LAS LECTURAS DEL PANEL SALEN JUNTO CON EL ÁRBOL (22/08/2026 · overhaul UX). Pasos, relaciones
  // e historial sólo necesitan el `act` de la URL, no el nodo resuelto: esperarlas DESPUÉS del
  // árbol era un viaje entero de más en cada clic sobre una fila. Sólo el contexto y la
  // vinculación necesitan campos del nodo, y quedan como segunda tanda.
  const [arbolRes, malImputados, pasos, relaciones, historial] = await Promise.all([
    getArbol(supabase, obraId),
    getAvancesSobreContenedor(supabase, obraId),
    act ? getPasos(supabase, act) : null,
    act ? getRelaciones(supabase, obraId) : null,
    act ? getHistorial(supabase, act) : null,
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
  const abierta = act ? arbol.find((n) => n.id === act) ?? null : null
  const [contexto, vinculacion] = abierta
    ? await Promise.all([
        getContextoTarea(supabase, obraId, {
          cuadrillaId: abierta.cuadrilla_id,
          cotizacionPartidaId: abierta.cotizacion_partida_id,
          tareaTipoId: abierta.tarea_tipo_id,
          finPlan: abierta.fin_plan,
        }, veEconomia),
        getVinculacionTarea(supabase, abierta),
      ])
    : [null, null]
  const solapa: Solapa = esSolapa(sol) ? sol : 'avance'
  const hrefLista = `/obras/${obraId}?vista=tareas&filtro=${vista}`

  return (
    <TabTareas
      obraId={obraId}
      nodos={arbol}
      filtro={vista}
      cuadrillas={cuadrillas}
      // `.bind(null, obraId)` Y NO UNA ARROW: una arrow escrita en el servidor es una función
      // nueva, no la acción, y React la rechaza en tiempo de ejecución dejando la solapa en blanco.
      // Ni el typecheck ni el build lo ven — sólo el navegador.
      aplicarEnLote={aplicarEnLote.bind(null, obraId)}
      malImputados={malImputados}
      panel={abierta ? (
        <PanelTarea
          obraId={obraId}
          nodo={abierta}
          solapa={solapa}
          pasos={pasos?.data ?? []}
          relaciones={relaciones?.data ?? []}
          historial={historial?.data ?? []}
          hrefLista={hrefLista}
          cuadrillas={cuadrillas}
          editarCampo={editarCampoDeTarea.bind(null, obraId, abierta.id)}
          contexto={contexto ?? CONTEXTO_VACIO}
          dotacion={dotacionDe(dot, abierta.dotacion_prevista, abierta.tope_frente)}
          puedeEditar={puedeEditar}
          vinculacion={vinculacion ?? VINCULACION_VACIA}
          acciones={{
            dividir: dividirEnFrentes.bind(null, obraId, abierta.id),
            cambiarRelacion: cambiarRelacion.bind(null, obraId),
            quitarRelacion: quitarRelacion.bind(null, obraId),
            vincularEstandar: vincularActividadAEstandar.bind(null, obraId, abierta.id),
          }}
        />
      ) : undefined}
    />
  )
}
