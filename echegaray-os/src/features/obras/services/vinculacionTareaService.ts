// LO QUE EL PANEL NECESITA PARA RESOLVER UNA ACTIVIDAD SIN VINCULAR.
//
// Dos lecturas, y NINGUNA cuando la actividad ya está vinculada o no aplica (un resumen, un tiempo
// técnico): el catálogo de análisis son 199 filas y pedirlas para dibujar un panel que no va a
// mostrar el formulario es pagarlas por nada.
//
// El ESTADO no se lee: se calcula con `estadoVinculacion()` sobre los campos que el árbol ya trajo.
// Una sexta consulta para preguntar algo que está en la fila que ya tengo en la mano es una consulta
// de más — y encima abriría la puerta a que la lista diga una cosa y el panel otra.

import type { SupabaseClient } from '@supabase/supabase-js'
import { estadoVinculacion, type EstadoVinculacion } from './vinculacionEstandar'

export interface OpcionEstandar {
  analisisId: string
  tareaTipoId: string
  codigo: string
  nombre: string
  unidad: string | null
  variante: string | null
}

export interface SugerenciaEstandar {
  tareaTipoId: string
  analisisId: string | null
  codigo: string
  nombre: string
  /** Por qué se sugiere. Se muestra SIEMPRE al lado de la sugerencia: una sugerencia sin su
   *  evidencia es una afirmación. */
  evidencia: string
  analisisVigentes: number
}

export interface VinculacionTarea {
  estado: EstadoVinculacion
  sugerencia: SugerenciaEstandar | null
  opciones: OpcionEstandar[]
}

interface ActividadDelArbol {
  id: string
  tipo: string
  tiempo_tecnico: boolean
  tarea_tipo_id: string | null
  analisis_id: string | null
}

interface FilaAnalisis {
  id: string
  tarea_tipo_id: string
  variante: string | null
  tarea_tipo: { codigo: string; nombre: string; unidad: string | null } | null
}

interface FilaSugerencia {
  tarea_tipo_id: string
  tarea_tipo_codigo: string
  tarea_tipo_nombre: string
  evidencia_texto: string
  analisis_sugerido_id: string | null
  analisis_vigentes: number | null
}

/** El catálogo contra el que se elige: un análisis VIGENTE por variante, con su tarea tipo. */
async function getOpciones(supabase: SupabaseClient): Promise<OpcionEstandar[]> {
  const { data } = await supabase.from('analisis')
    .select('id, tarea_tipo_id, variante, tarea_tipo(codigo, nombre, unidad)')
    .eq('vigente', true)
  const filas = (data ?? []) as unknown as FilaAnalisis[]
  return filas
    .filter((f) => f.tarea_tipo !== null)
    .map((f) => ({
      analisisId: f.id,
      tareaTipoId: f.tarea_tipo_id,
      codigo: f.tarea_tipo!.codigo,
      nombre: f.tarea_tipo!.nombre,
      unidad: f.tarea_tipo!.unidad,
      variante: f.variante,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/**
 * El estado de vinculación de la actividad abierta y, si hace falta resolverlo, con qué.
 *
 * Ninguna de las dos lecturas hace fallar el panel: si el catálogo no se puede leer, el formulario
 * queda sin opciones y la pantalla lo dice — que es mejor que un panel en blanco.
 */
export async function getVinculacionTarea(
  supabase: SupabaseClient, actividad: ActividadDelArbol,
): Promise<VinculacionTarea> {
  const estado = estadoVinculacion({
    tipo: actividad.tipo,
    tiempoTecnico: actividad.tiempo_tecnico,
    tareaTipoId: actividad.tarea_tipo_id,
    analisisId: actividad.analisis_id,
  })
  if (estado === 'no_aplica' || estado === 'vinculada') return { estado, sugerencia: null, opciones: [] }

  const [sug, opciones] = await Promise.all([
    supabase.from('obra_actividad_sugerencia_estandar')
      .select('tarea_tipo_id, tarea_tipo_codigo, tarea_tipo_nombre, evidencia_texto, analisis_sugerido_id, analisis_vigentes')
      .eq('actividad_id', actividad.id).maybeSingle(),
    getOpciones(supabase),
  ])

  const s = sug.data as FilaSugerencia | null
  return {
    estado,
    sugerencia: s
      ? {
          tareaTipoId: s.tarea_tipo_id,
          analisisId: s.analisis_sugerido_id,
          codigo: s.tarea_tipo_codigo,
          nombre: s.tarea_tipo_nombre,
          evidencia: s.evidencia_texto,
          analisisVigentes: Number(s.analisis_vigentes ?? 0),
        }
      : null,
    opciones,
  }
}
