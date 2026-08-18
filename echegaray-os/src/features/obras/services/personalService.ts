// PERSONAL DE OBRA — el acceso a datos de quién trabaja dónde.
//
// FRONTERA: este módulo NO administra legajos. `personas` es de RRHH y acá sólo se lee para poder
// elegir un nombre; `registros_hh` es de productividad y acá sólo se lee para mostrar el detalle que
// respalda el total. El total de HH real NO se suma acá: lo publica `obra_plan_vs_real`, que es la
// única fuente del número. Sumarlo también en esta capa sería la segunda versión del mismo dato.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Asignacion, Persona, ServiceResult } from '../types'

/** El plantel elegible. Quien tiene fecha de egreso ya no está: no se ofrece para asignar. */
export async function getPersonas(supabase: SupabaseClient): Promise<ServiceResult<Persona[]>> {
  const { data, error } = await supabase
    .from('personas')
    .select('id, nombre_completo, categoria, especialidad, fecha_egreso')
    .is('fecha_egreso', null)
    .order('nombre_completo', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as Persona[], error: null }
}

/** Quién está asignado a la obra. El nombre viene del join con `personas`: acá no se copia. */
export async function getAsignaciones(supabase: SupabaseClient, obraId: string): Promise<ServiceResult<Asignacion[]>> {
  const { data, error } = await supabase
    .from('obra_asignacion')
    .select('*, personas(nombre_completo, especialidad)')
    .eq('obra_id', obraId)
    .order('rol', { ascending: true })
  if (error) return { data: null, error: error.message }

  const filas = (data ?? []).map((a) => {
    const p = (a as { personas?: { nombre_completo?: string; especialidad?: string } | null }).personas
    return {
      ...(a as unknown as Asignacion),
      // El nombre puede faltar si la persona se borró del legajo: se publica el vínculo igual, con
      // el nombre en null. Perder la fila entera escondería una asignación que existe.
      persona_nombre: p?.nombre_completo ?? null,
      persona_especialidad: p?.especialidad ?? null,
    } as Asignacion
  })
  // Responsables primero y después por nombre: es el orden en que se lee una lista de plantel.
  filas.sort((a, b) =>
    a.rol === b.rol
      ? String(a.persona_nombre ?? '').localeCompare(String(b.persona_nombre ?? ''))
      : a.rol === 'responsable' ? -1 : 1)
  return { data: filas, error: null }
}

export interface RegistroHH {
  id: string
  trabajador_o_cuadrilla: string
  fecha_inicio_semana: string
  horas: number
  categoria: string | null
}

/**
 * El DETALLE de las HH imputadas a la obra, para que el total se pueda auditar.
 *
 * Se filtra por `obra_canonica_id`, no por el `obra_id` legacy: las 19 filas cargadas cuelgan de
 * `public.obras`, y hasta que alguien las mapee al eje canónico esta consulta devuelve vacío. Ese
 * vacío es un dato —"nadie imputó HH a esta obra"— y la pantalla lo dice con esas palabras.
 */
export async function getRegistrosHH(supabase: SupabaseClient, obraId: string): Promise<ServiceResult<RegistroHH[]>> {
  const { data, error } = await supabase
    .from('registros_hh')
    .select('id, trabajador_o_cuadrilla, fecha_inicio_semana, horas, categoria')
    .eq('obra_canonica_id', obraId)
    .order('fecha_inicio_semana', { ascending: false })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as RegistroHH[], error: null }
}
