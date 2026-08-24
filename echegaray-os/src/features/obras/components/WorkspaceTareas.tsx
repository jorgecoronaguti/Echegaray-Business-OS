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
import { getDocumentos } from '../services/obrasService'
import { getPersonas } from '../services/personalService'
import { crearActividad } from '../services/actions'
import { crearRubro } from '../services/actionsRubro'
import { urlDeDrive } from '../services/driveUrl'
import { esVistaArbol, type VistaArbol } from '../services/vistaArbol'
import { aplicarEnLote, editarCampoDeTarea } from '../services/actionsAvance'
import { cambiarRelacion, dividirEnFrentes, quitarRelacion } from '../services/actionsEstructura'
import { vincularActividadAEstandar } from '../services/actionsVinculacion'

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
  const [arbolRes, malImputados, relacionesRes] = await Promise.all([
    getArbol(supabase, obraId),
    getAvancesSobreContenedor(supabase, obraId),
    getRelaciones(supabase, obraId),
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

  // La segunda tanda necesita los ids del árbol; junta el material del panel y los papeles.
  // Las personas sólo se leen si esta cara va a OFRECER el alta: quien no puede crear no necesita
  // el desplegable de responsable, y la lectura ni se hace.
  const [panel, documentosRes, personasRes] = await Promise.all([
    getPanelDeObra(supabase, obraId, arbol, veEconomia),
    getDocumentos(supabase, obraId),
    puedeEditar ? getPersonas(supabase) : Promise.resolve(null),
  ])
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
      // `.bind(null, obraId)` Y NO UNA ARROW: una arrow escrita en el servidor es una función
      // nueva, no la acción, y React la rechaza en tiempo de ejecución dejando la solapa en blanco.
      // El id de la ACTIVIDAD lo ata el cliente con otro `.bind` — viaja como argumento, igual que
      // viajaba en la URL, y cada acción vuelve a acotar por `obra_id` del lado del servidor.
      aplicarEnLote={aplicarEnLote.bind(null, obraId)}
      malImputados={malImputados}
      panelDeObra={panel}
      relaciones={relacionesRes.data ?? []}
      docsPorActividad={docsPorActividad}
      actInicial={act ?? null}
      solInicial={sol ?? null}
      dotInicial={dot ?? null}
      puedeEditar={puedeEditar}
      personas={personasRes?.data ?? []}
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
      }}
    />
  )
}
