// EL WORKSPACE DE TAREAS, CABLEADO — un Server Component que hace SUS lecturas y arma sus dos
// piezas: la tabla del árbol (03) y, si hay una actividad abierta, su panel de siete solapas (04).
//
// Vive acá y no en `page.tsx` por una razón medible: la página de la obra ya tenía 554 líneas —por
// encima del tope de 500 del repositorio— y sumarle las diez lecturas de este workspace la dejaba
// en 617. Cada solapa que se cablea adentro de la página hace más difícil ver qué pide cada una.
//
// EL PANEL SE ARMA EN EL SERVIDOR y baja como `children`: sus solapas son tres lecturas más, y
// traerlas al cliente por cada clic sería traerlas por cada clic.

import type { SupabaseClient } from '@supabase/supabase-js'
import { TabTareas } from './TabTareas'
import { PanelTarea, esSolapa, type Solapa } from './PanelTarea'
import {
  getArbol, getAvancesSobreContenedor, getHistorial, getPasos, getRelaciones,
} from '../services/tareasService'
import { esVistaArbol, type VistaArbol } from '../services/vistaArbol'
import { aplicarEnLote, editarCampoDeTarea } from '../services/actionsAvance'

export async function WorkspaceTareas({
  supabase, obraId, act, filtro, sol, cuadrillas,
}: {
  supabase: SupabaseClient
  obraId: string
  act: string | undefined
  filtro: string | undefined
  sol: string | undefined
  cuadrillas: { id: string; nombre: string }[]
}) {
  const vista: VistaArbol = esVistaArbol(filtro) ? filtro : 'todo'
  const [arbolRes, malImputados] = await Promise.all([
    getArbol(supabase, obraId),
    getAvancesSobreContenedor(supabase, obraId),
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
  const [pasos, relaciones, historial] = abierta
    ? await Promise.all([
        getPasos(supabase, abierta.id),
        getRelaciones(supabase, obraId),
        getHistorial(supabase, abierta.id),
      ])
    : [null, null, null]
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
        />
      ) : undefined}
    />
  )
}
