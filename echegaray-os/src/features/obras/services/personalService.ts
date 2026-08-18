// PERSONAL DE OBRA — el acceso a datos de quién trabaja dónde.
//
// FRONTERA: este módulo NO administra legajos. El legajo es de Administración
// (`/administracion/personas`); acá sólo se lee para poder elegir un nombre. `registros_hh` es de
// productividad y acá sólo se lee para mostrar el detalle que respalda el total. El total de HH real
// NO se suma acá: lo publica `obra_plan_vs_real`, que es la única fuente del número. Sumarlo también
// en esta capa sería la segunda versión del mismo dato.
//
// ═══ POR QUÉ SE LEE `persona_plantel` Y NO `personas` (19/08/2026) ═══
//
// `personas` guarda `retribucion_pactada`, `cuil`, `dni`, `fecha_nacimiento`, `art` y `obra_social`,
// y su policy de SELECT decía `using (true)`: cualquier autenticado —un jefe de obra, con las
// devtools abiertas— leía sueldos y documentos por PostgREST. Ahora la tabla es de Administración y
// la obra lee `persona_plantel`, que publica sólo lo operativo: quién es, categoría, especialidad y
// si sigue en el plantel. Ver `20260819T1200_administracion_personas_y_proveedores.sql`.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Asignacion, Persona, ServiceResult } from '../types'

/** El plantel elegible. Quien tiene fecha de egreso ya no está: no se ofrece para asignar. */
export async function getPersonas(supabase: SupabaseClient): Promise<ServiceResult<Persona[]>> {
  const { data, error } = await supabase
    .from('persona_plantel')
    .select('id, nombre_completo, categoria, especialidad, fecha_egreso')
    .is('fecha_egreso', null)
    .order('nombre_completo', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as Persona[], error: null }
}

/**
 * Quién está asignado a la obra. El nombre NO se copia: se resuelve contra el plantel.
 *
 * Son dos consultas y no un embed de PostgREST porque el nombre ahora vive en la vista
 * `persona_plantel`, y PostgREST sólo sabe embeber por una clave foránea declarada —que una vista no
 * tiene. Un `personas(...)` embebido seguiría compilando y devolvería `null` para todo el mundo
 * salvo Administración: la pantalla del jefe de obra habría mostrado "persona borrada del legajo" en
 * cada fila, que es el modo de falla más caro de todos, porque parece un dato.
 */
export async function getAsignaciones(supabase: SupabaseClient, obraId?: string): Promise<ServiceResult<Asignacion[]>> {
  // SIN `obraId` DEVUELVE EL PLANTEL DE TODAS LAS OBRAS VISIBLES, por el mismo camino. Quién ve qué
  // obra lo decide el RLS de `obra_asignacion`, no este `if`.
  const base = supabase.from('obra_asignacion').select('*')
  const { data, error } = await (obraId ? base.eq('obra_id', obraId) : base)
    .order('obra_id', { ascending: true })
    .order('rol', { ascending: true })
  if (error) return { data: null, error: error.message }

  const crudas = (data ?? []) as unknown as Asignacion[]
  const ids = [...new Set(crudas.map((a) => a.persona_id).filter(Boolean))] as string[]
  const plantel = new Map<string, { nombre_completo: string | null; especialidad: string | null }>()
  if (ids.length > 0) {
    const { data: personas } = await supabase
      .from('persona_plantel')
      .select('id, nombre_completo, especialidad')
      .in('id', ids)
    for (const p of (personas ?? []) as { id: string; nombre_completo: string | null; especialidad: string | null }[]) {
      plantel.set(p.id, { nombre_completo: p.nombre_completo, especialidad: p.especialidad })
    }
  }

  const filas = crudas.map((a) => {
    const p = a.persona_id ? plantel.get(a.persona_id) : undefined
    return {
      ...a,
      // El nombre puede faltar si la persona se borró del legajo: se publica el vínculo igual, con
      // el nombre en null. Perder la fila entera escondería una asignación que existe.
      persona_nombre: p?.nombre_completo ?? null,
      persona_especialidad: p?.especialidad ?? null,
    } as Asignacion
  })
  // Responsables primero y después por nombre: es el orden en que se lee una lista de plantel. En la
  // lista global el criterio se aplica DENTRO de cada obra, que es como se lee una lista agrupada.
  filas.sort((a, b) =>
    a.obra_id !== b.obra_id
      ? a.obra_id.localeCompare(b.obra_id)
      : a.rol === b.rol
        ? String(a.persona_nombre ?? '').localeCompare(String(b.persona_nombre ?? ''))
        : a.rol === 'responsable' ? -1 : 1)
  return { data: filas, error: null }
}

export interface RegistroHH {
  id: string
  /** De qué obra son estas horas. La solapa de la obra no la usa; la lista global la muestra. */
  obra_canonica_id: string | null
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
export async function getRegistrosHH(supabase: SupabaseClient, obraId?: string): Promise<ServiceResult<RegistroHH[]>> {
  const base = supabase
    .from('registros_hh')
    .select('id, obra_canonica_id, trabajador_o_cuadrilla, fecha_inicio_semana, horas, categoria')
  const { data, error } = await (obraId ? base.eq('obra_canonica_id', obraId) : base)
    // Las 19 filas históricas cuelgan de la tabla legacy y tienen `obra_canonica_id` en null: en la
    // lista global aparecen como «sin obra», que es exactamente lo que son. No se les inventa una.
    .not('obra_canonica_id', 'is', null)
    .order('fecha_inicio_semana', { ascending: false })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as RegistroHH[], error: null }
}
