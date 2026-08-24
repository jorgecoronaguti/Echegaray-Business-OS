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
