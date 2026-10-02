// LA LECTURA DE LA PARTICIPACIÓN — los hechos que necesita `participacion.ts`, y nada más.
//
// Cuatro lecturas chicas, cada una de SU fuente, y una sola regla aplicada después (`participacion.ts`).
// Sin vista nueva a propósito: con la RLS vigente el jefe de obra y Dirección leen las mismas filas de
// `registros_hh`, `obra_ejecucion` y `obra_ejecucion_persona` (las tres pasan por `es_administracion`,
// que incluye a `jefe_obra`), y una vista que el código necesitara antes de que la base la tenga
// dejaría la ficha caída hasta que alguien aplique la migración.
//
// Los jefes de obra quedan fuera, con la MISMA definición que `hh_que_cuentan_en_obra`
// (`esJefeDeObra(puesto)`): sus horas no son HH de obra y no son cuadrilla.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '@/features/auth/services/authService'
import type { Esperado } from '@/features/administracion/services/presencia'
import { esJefeDeObra } from '@/features/administracion/services/vocabularioPersona'
import { TRABAJADAS } from './tipoHora'
import { getEsperados } from '@/features/administracion/services/presenciaService'
import { getActividadHH, getPersonasDeHoy, type ActividadHH, type PersonasDeHoy } from './personalService'
import {
  cuadrillaConParticipantes, hhDeParticipacionPorTarea, horasDeParticipacion,
  type HoraRegistrada, type HorasDeParticipacion, type ParticipacionDeParte,
} from './participacion'

export interface ParticipacionDeObra {
  /** Todas las horas de las participaciones de la obra en el período, con su origen. */
  horas: HorasDeParticipacion[]
  /** Las personas que participaron, en la forma de la cuadrilla (`Esperado`). */
  personas: Esperado[]
}

/** La ficha mira la obra desde su inicio: la fecha más vieja que puede tener un parte. */
const DESDE_SIEMPRE = '2000-01-01'

const num = (v: unknown) => (v == null ? null : Number(v))

/** Las participaciones de la obra en [desde, hasta]: del parte y de las horas imputadas a tareas. */
async function participacionesDeLaObra(
  supabase: SupabaseClient, obraId: string, desde: string, hasta: string,
): Promise<ServiceResult<{ partes: ParticipacionDeParte[]; personas: Set<string>; fechas: string[] }>> {
  const [ep, hh] = await Promise.all([
    supabase.from('obra_ejecucion_persona')
      .select('persona_id, horas, obra_ejecucion!inner(actividad_id, fecha, obra_id)')
      .eq('obra_id', obraId).gte('obra_ejecucion.fecha', desde).lte('obra_ejecucion.fecha', hasta).limit(5000),
    supabase.from('registros_hh').select('persona_id, fecha')
      .eq('obra_canonica_id', obraId).gte('fecha', desde).lte('fecha', hasta)
      .not('persona_id', 'is', null).not('actividad_id', 'is', null).limit(5000),
  ])
  if (ep.error) return { data: null, error: ep.error.message }
  if (hh.error) return { data: null, error: hh.error.message }
  const partes: ParticipacionDeParte[] = []
  for (const r of ep.data ?? []) {
    const f = r as { persona_id: string; horas: unknown; obra_ejecucion: unknown }
    const e = (Array.isArray(f.obra_ejecucion) ? f.obra_ejecucion[0] : f.obra_ejecucion) as
      { actividad_id: string | null; fecha: string; obra_id: string } | null
    if (!e?.actividad_id) continue
    partes.push({ persona_id: f.persona_id, obra_id: e.obra_id, actividad_id: e.actividad_id, fecha: e.fecha, horas: num(f.horas) })
  }
  const filasHH = (hh.data ?? []) as { persona_id: string; fecha: string }[]
  const personas = new Set([...partes.map((p) => p.persona_id), ...filasHH.map((r) => r.persona_id)])
  const fechas = [...new Set([...partes.map((p) => p.fecha), ...filasHH.map((r) => r.fecha)])]
  return { data: { partes, personas, fechas }, error: null }
}

/**
 * La participación de una obra en un período: las horas (con origen y base) y las personas.
 *
 * Para repartir bien hay que mirar el día ENTERO de cada persona —sus partes y sus horas en
 * cualquier obra—, por eso la segunda tanda de lecturas va por persona y no por obra.
 */
export async function getParticipacionDeObra(
  supabase: SupabaseClient, obraId: string, desde: string, hasta: string,
): Promise<ServiceResult<ParticipacionDeObra>> {
  const base = await participacionesDeLaObra(supabase, obraId, desde, hasta)
  if (base.error || !base.data) return { data: null, error: base.error }
  const ids = [...base.data.personas]
  if (ids.length === 0) return { data: { horas: [], personas: [] }, error: null }
  // SÓLO LOS DÍAS CON PARTICIPACIÓN, no el período entero: la ficha mira la obra desde su inicio y
  // traer cada hora de cada participante de ese lapso chocaría con el tope de filas de PostgREST,
  // que corta en silencio. El reparto sólo necesita esos días.
  const fechas = base.data.fechas

  const [dir, regs, otrosPartes] = await Promise.all([
    supabase.from('persona_directorio')
      .select('id, nombre_completo, nombre_para_mostrar, categoria, obra_actual_id, obra_actual, cuadrilla, puesto').in('id', ids),
    supabase.from('registros_hh').select('persona_id, obra_canonica_id, actividad_id, fecha, horas')
      .in('persona_id', ids).in('fecha', fechas).in('tipo_hora', [...TRABAJADAS]).limit(10000),
    supabase.from('obra_ejecucion_persona')
      .select('persona_id, horas, obra_ejecucion!inner(actividad_id, fecha, obra_id)')
      .in('persona_id', ids).neq('obra_id', obraId).in('obra_ejecucion.fecha', fechas).limit(5000),
  ])
  const error = dir.error ?? regs.error ?? otrosPartes.error
  if (error) return { data: null, error: error.message }

  const directorio = (dir.data ?? []) as (Esperado & { puesto: string | null })[]
  const jefes = new Set(directorio.filter((p) => esJefeDeObra(p.puesto)).map((p) => p.id))
  const partes = [...base.data.partes]
  for (const r of otrosPartes.data ?? []) {
    const f = r as { persona_id: string; horas: unknown; obra_ejecucion: unknown }
    const e = (Array.isArray(f.obra_ejecucion) ? f.obra_ejecucion[0] : f.obra_ejecucion) as
      { actividad_id: string | null; fecha: string; obra_id: string } | null
    if (e?.actividad_id) partes.push({ persona_id: f.persona_id, obra_id: e.obra_id, actividad_id: e.actividad_id, fecha: e.fecha, horas: num(f.horas) })
  }
  const registros: HoraRegistrada[] = (regs.data ?? []).map((r) => {
    const f = r as { persona_id: string; obra_canonica_id: string | null; actividad_id: string | null; fecha: string; horas: unknown }
    return { persona_id: f.persona_id, obra_id: f.obra_canonica_id, actividad_id: f.actividad_id, fecha: f.fecha, horas: Number(f.horas ?? 0) }
  })

  const horas = horasDeParticipacion(
    partes.filter((p) => !jefes.has(p.persona_id)), registros.filter((r) => !jefes.has(r.persona_id)),
  )
  const personas: Esperado[] = directorio.filter((p) => !jefes.has(p.id)).map((p) => ({
    id: p.id, nombre_completo: p.nombre_completo, nombre_para_mostrar: p.nombre_para_mostrar,
    categoria: p.categoria, obra_actual_id: p.obra_actual_id, obra_actual: p.obra_actual, cuadrilla: p.cuadrilla,
  }))
  return { data: { horas, personas }, error: null }
}

/**
 * LA CUADRILLA DE LA OBRA EN UN PERÍODO — la única definición que usan las pantallas de ERP Obras.
 *
 * Los asignados vigentes (`getEsperados`, la asignación de la PERSONA) más quien figura como
 * participante de una tarea de la obra en [desde, hasta], aunque esté asignado a otra obra. No toca
 * `obra_asignacion`: el que entra por participar viene con `por_participacion = true`.
 */
export async function getCuadrillaDeObra(
  supabase: SupabaseClient, obraId: string, desde: string, hasta: string,
): Promise<ServiceResult<(Esperado & { por_participacion: boolean })[]>> {
  const [asignados, part] = await Promise.all([
    getEsperados(supabase, obraId),
    getParticipacionDeObra(supabase, obraId, desde, hasta),
  ])
  if (asignados.error || !asignados.data) return { data: null, error: asignados.error }
  if (part.error || !part.data) return { data: null, error: part.error }
  return { data: cuadrillaConParticipantes(asignados.data, part.data.personas), error: null }
}

/**
 * Las personas de hoy del Resumen, con quien participó hoy de un avance sin estar asignado. Se
 * cuenta aparte (`por_participacion`): «asignadas» sigue diciendo lo que dice `obra_asignacion`.
 */
export async function getPersonasDeHoyConParticipacion(
  supabase: SupabaseClient, obraId: string, hoy: string,
): Promise<PersonasDeHoy> {
  const [base, cuadrilla] = await Promise.all([
    getPersonasDeHoy(supabase, obraId),
    getCuadrillaDeObra(supabase, obraId, hoy, hoy),
  ])
  const extra = (cuadrilla.data ?? []).filter((p) => p.por_participacion).length
  return extra > 0 ? { ...base, por_participacion: extra } : base
}

/** Las HH por tarea de `obra_actividad_hh` (lo cargado) con lo que agrega la participación aparte. */
export type ActividadHHConParticipacion = ActividadHH & {
  /** HH de participantes que `registros_hh` no tiene: horas del parte o reparto calculado. */
  hh_participacion: number | null
  /** Alguna de esas HH es reparto calculado, no carga: la pantalla lo rotula «calculado». */
  hh_participacion_calculada: boolean
}

/**
 * La tabla de HH por tarea de la ficha, con los participantes del avance sumados APARTE.
 *
 * `hh_real` queda como lo publica la vista —lo cargado— y la participación va en su propio campo:
 * mezclarla adentro haría que el desvío y el rendimiento midieran contra un número que en parte
 * nadie cargó, sin que nadie lo sepa.
 */
export async function getActividadHHConParticipacion(
  supabase: SupabaseClient, obraId: string, hasta: string,
): Promise<ServiceResult<ActividadHHConParticipacion[]>> {
  const [hh, part] = await Promise.all([
    getActividadHH(supabase, obraId),
    getParticipacionDeObra(supabase, obraId, DESDE_SIEMPRE, hasta),
  ])
  if (hh.error || !hh.data) return { data: null, error: hh.error }
  if (part.error || !part.data) return { data: null, error: part.error }
  const porTarea = hhDeParticipacionPorTarea(part.data.horas, obraId)
  return {
    data: hh.data.map((a) => {
      const p = porTarea.get(a.actividad_id)
      return { ...a, hh_participacion: p?.horas ?? null, hh_participacion_calculada: p?.calculada ?? false }
    }),
    error: null,
  }
}
