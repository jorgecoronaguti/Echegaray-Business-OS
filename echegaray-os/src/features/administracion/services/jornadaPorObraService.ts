// LAS LECTURAS DE LA ASISTENCIA POR OBRA. Una sola fuente: `registros_hh`.
//
// Ni una regla de negocio acá: lo que significa cada silencio lo deciden `jornadaPorObra.ts` y
// `semanaPorObra.ts`, que se prueban sin base. Este archivo trae filas y nada más.
//
// ═══ QUIÉN VE QUÉ NO SE DECIDE ACÁ ═══
//
// `obra_canonica` tiene RLS por `ve_obra(id)` y `obra_asignacion` la suya: un jefe de obra ve las
// obras que tiene asignadas y Administración las ve todas. Repetir el criterio en TypeScript sería
// una segunda definición del alcance que además no protege la llamada directa a PostgREST.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAsignaciones } from '../../obras/services/personalService.ts'
import type { FilaJornada } from './jornadaPorObra.ts'
import { armarJornada } from './jornadaPorObra.ts'
import type { AsignacionSemana, RegistroSemana } from './semanaPorObra.ts'

export interface ObraDeLaJornada {
  id: string
  nombre: string
  /** `obra_canonica.jornada_horas`. Lo que la casilla trae puesto. */
  jornada: number
}

export interface JornadaDelDia {
  obra: ObraDeLaJornada
  filas: FilaJornada[]
}

/** Sin jornada pactada la pantalla NO inventa una: la casilla nace vacía y se tipea. */
const JORNADA_SIN_DATO = 0

const numero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? n : JORNADA_SIN_DATO
}

/** La nota gris debajo del nombre: el rol de la asignación, y si no hay, la categoría de convenio. */
function notaDe(a: { rol: string | null; persona_categoria: string | null }): string | null {
  const rol = (a.rol ?? '').trim()
  if (rol && rol !== 'operario') return rol
  return (a.persona_categoria ?? '').trim() || null
}

/** ¿Estaba asignado ese día? `desde`/`hasta` en null significan «sin límite», no «nunca». */
const vigenteEn = (a: { desde: string | null; hasta: string | null }, fecha: string): boolean =>
  (!a.desde || a.desde <= fecha) && (!a.hasta || a.hasta >= fecha)

export async function getObraDeLaJornada(
  supabase: SupabaseClient, obraId: string,
): Promise<{ data: ObraDeLaJornada | null; error: string | null }> {
  const { data, error } = await supabase
    .from('obra_canonica').select('id, nombre, jornada_horas').eq('id', obraId).maybeSingle()
  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: null }
  const o = data as { id: string; nombre: string; jornada_horas: number | string | null }
  return { data: { id: o.id, nombre: o.nombre, jornada: numero(o.jornada_horas) }, error: null }
}

/**
 * Una obra, un día: quién está asignado y qué tiene cargado.
 *
 * La lista son los ASIGNADOS más quien ya tiene horas cargadas ese día aunque su asignación haya
 * terminado — si no, corregir el día de alguien que se fue sería imposible y sus horas quedarían
 * fuera de la vista de quien las tiene que revisar.
 */
export async function getJornadaDelDia(
  supabase: SupabaseClient, obraId: string, fecha: string,
): Promise<{ data: JornadaDelDia | null; error: string | null }> {
  const [obra, asignaciones, registros] = await Promise.all([
    getObraDeLaJornada(supabase, obraId),
    getAsignaciones(supabase, obraId),
    supabase.from('registros_hh')
      .select('id, persona_id, fecha, horas, tipo_hora, notas')
      .eq('obra_canonica_id', obraId).eq('fecha', fecha).not('persona_id', 'is', null),
  ])
  if (obra.error) return { data: null, error: obra.error }
  if (!obra.data) return { data: null, error: null }
  if (asignaciones.error) return { data: null, error: asignaciones.error }
  if (registros.error) return { data: null, error: registros.error.message }

  const filasHH = (registros.data ?? []) as {
    id: string; persona_id: string; fecha: string; horas: number | string; tipo_hora: string; notas: string | null
  }[]
  const conHoras = new Set(filasHH.map((r) => r.persona_id))

  const personas = (asignaciones.data ?? [])
    .filter((a) => a.persona_nombre && (vigenteEn(a, fecha) || conHoras.has(a.persona_id)))
    .map((a) => ({ persona_id: a.persona_id, nombre: a.persona_nombre as string, nota: notaDe(a) }))
  // Una sola fila por persona: dos asignaciones vigentes en la misma obra (dos frentes) no son dos
  // personas. Sin esto, el mismo nombre aparecería dos veces y el pie contaría de más.
  const unicas = [...new Map(personas.map((p) => [p.persona_id, p])).values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  return {
    data: {
      obra: obra.data,
      filas: armarJornada({
        personas: unicas,
        registros: filasHH.map((r) => ({ ...r, horas: Number(r.horas) })),
        jornada: obra.data.jornada,
      }),
    },
    error: null,
  }
}

export interface DatosSemanaPorObra {
  asignaciones: AsignacionSemana[]
  registros: RegistroSemana[]
  noLaborables: string[]
}

/** Los feriados de la ventana. La misma tabla que lee la grilla de presencia — no una lista aparte. */
async function getNoLaborables(
  supabase: SupabaseClient, desde: string, hasta: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('calendario_no_laborable').select('fecha').gte('fecha', desde).lte('fecha', hasta)
  return ((data ?? []) as { fecha: string }[]).map((f) => f.fecha)
}

/** La semana entera, de todas las obras que la sesión puede ver. */
export async function getSemanaPorObra(
  supabase: SupabaseClient, desde: string, hasta: string,
): Promise<{ data: DatosSemanaPorObra | null; error: string | null }> {
  const [asignaciones, registros, obras, noLaborables] = await Promise.all([
    getAsignaciones(supabase),
    supabase.from('registros_hh')
      .select('persona_id, obra_canonica_id, fecha, horas, tipo_hora')
      .gte('fecha', desde).lte('fecha', hasta)
      .not('persona_id', 'is', null).not('obra_canonica_id', 'is', null),
    supabase.from('obra_canonica').select('id, nombre'),
    getNoLaborables(supabase, desde, hasta),
  ])
  if (asignaciones.error) return { data: null, error: asignaciones.error }
  if (registros.error) return { data: null, error: registros.error.message }
  if (obras.error) return { data: null, error: obras.error.message }

  const nombreDeObra = new Map((obras.data ?? []).map((o) => [o.id as string, o.nombre as string]))
  return {
    data: {
      asignaciones: (asignaciones.data ?? [])
        // Vigente en algún punto de la ventana, no sólo el último día: quien empezó el jueves entra,
        // y quien terminó el martes también — sus horas del lunes y el martes son reales y son de
        // esa obra. Sin nombre no se dibuja: una fila que no se puede nombrar no sirve para marcar.
        .filter((a) => Boolean(a.persona_nombre)
          && (!a.desde || a.desde <= hasta) && (!a.hasta || a.hasta >= desde))
        .map((a) => ({
          persona_id: a.persona_id,
          nombre: a.persona_nombre as string,
          nota: notaDe(a),
          obra_id: a.obra_id,
          obra: nombreDeObra.get(a.obra_id) ?? a.obra_id,
        })),
      registros: ((registros.data ?? []) as {
        persona_id: string; obra_canonica_id: string; fecha: string; horas: number | string; tipo_hora: string
      }[]).map((r) => ({
        persona_id: r.persona_id,
        obra_id: r.obra_canonica_id,
        fecha: r.fecha.slice(0, 10),
        horas: Number(r.horas),
        tipo_hora: r.tipo_hora,
      })),
      noLaborables,
    },
    error: null,
  }
}
