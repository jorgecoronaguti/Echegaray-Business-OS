// EL CONTEXTO DE UNA TAREA, ARMADO EN EL CLIENTE — puro, sin una sola lectura.
//
// La lectura la hizo `panelObraService` una vez por obra; acá sólo se ELIGE lo que le toca a la
// actividad abierta. Es la mitad del contrato «panel < 200 ms»: cambiar de actividad no puede
// costar una consulta, porque el material ya está en la mano.

import type { NodoObra } from './wbs.ts'
import type { ContextoTarea } from './panelTareaService.ts'
import type { VinculacionTarea } from './vinculacionTareaService.ts'
import type { PanelDeObra } from './panelObraService.ts'
import { estadoVinculacion } from './vinculacionEstandar.ts'

export function armarContexto(nodo: NodoObra, panel: PanelDeObra): ContextoTarea {
  const partida = nodo.cotizacion_partida_id ? panel.partidas[nodo.cotizacion_partida_id] ?? null : null
  return {
    jornadaHoras: panel.jornadaHoras,
    diasHabiles: panel.diasHabiles,
    capacidadCuadrilla: nodo.cuadrilla_id != null
      ? panel.capacidadPorCuadrilla[nodo.cuadrilla_id] ?? null
      : null,
    partida,
    puedeVerPartida: panel.puedeVerPartida,
    historico: nodo.tarea_tipo_id ? panel.historicos[nodo.tarea_tipo_id] ?? null : null,
    diasHastaFinPlan: nodo.fin_plan != null ? panel.diasHastaFin[nodo.fin_plan] ?? null : null,
  }
}

export function armarVinculacion(nodo: NodoObra, panel: PanelDeObra): VinculacionTarea {
  const estado = estadoVinculacion({
    tipo: nodo.tipo,
    tiempoTecnico: nodo.tiempo_tecnico,
    tareaTipoId: nodo.tarea_tipo_id,
    analisisId: nodo.analisis_id,
  })
  if (estado === 'no_aplica' || estado === 'vinculada') return { estado, sugerencia: null, opciones: [] }
  return {
    estado,
    sugerencia: panel.sugerencias[nodo.id] ?? null,
    opciones: panel.opcionesEstandar,
  }
}

// ═══ LA CUADRILLA CON NOMBRE Y CARA (04 · «5 personas · Cuadrilla 2») ═══
//
// El canónico pone en el panel quiénes son, no cuántos: el jefe reconoce a su gente por la cara y
// por el apodo, y «5 personas» solo no le dice si están los que él pidió.

export interface CuadrillaDeLaTarea {
  nombre: string
  /** Los nombres completos de quienes la integran HOY (`cuadrilla_integrante` sin `hasta`). */
  integrantes: string[]
}

/** Las iniciales de un nombre para el avatar: dos letras, la del nombre y la del apellido.
 *  Un nombre de una sola palabra da UNA letra, no una inventada. */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const letras = partes.length === 1
    ? [partes[0][0]]
    : [partes[0][0], partes[partes.length - 1][0]]
  return letras.join('').toUpperCase()
}

/**
 * La cuadrilla de una actividad, con sus integrantes vigentes.
 *
 * SIN CUADRILLA ASIGNADA devuelve `null` — no una cuadrilla vacía: «nadie asignó una cuadrilla» y
 * «la cuadrilla no tiene gente cargada» son dos problemas distintos y se resuelven en lugares
 * distintos. La lista vacía es un hecho legítimo y se dice con esas palabras.
 */
export function cuadrillaDeLaTarea(
  nodo: Pick<NodoObra, 'cuadrilla_id' | 'cuadrilla'>,
  cuadrillas: readonly { id: string; nombre: string }[],
  integrantesPorCuadrilla: Record<string, string[]>,
  nombrePorPersona: Record<string, string>,
): CuadrillaDeLaTarea | null {
  if (!nodo.cuadrilla_id) return nodo.cuadrilla ? { nombre: nodo.cuadrilla, integrantes: [] } : null
  const nombre = cuadrillas.find((c) => c.id === nodo.cuadrilla_id)?.nombre ?? nodo.cuadrilla ?? 'Cuadrilla'
  const ids = integrantesPorCuadrilla[nodo.cuadrilla_id] ?? []
  // Un id sin nombre NO se dibuja como un avatar «?»: quiere decir que esa persona no está en el
  // plantel que esta cara puede leer, y un avatar mudo se cuenta como si fuera gente en la obra.
  return { nombre, integrantes: ids.map((id) => nombrePorPersona[id]).filter(Boolean) }
}
