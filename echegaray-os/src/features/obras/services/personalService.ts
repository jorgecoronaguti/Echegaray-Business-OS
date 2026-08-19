// PERSONAL DE OBRA — el acceso a datos de quién trabaja dónde y cuántas horas lleva.
//
// FRONTERA: este módulo NO administra legajos. El legajo es de Administración
// (`/administracion/personas`); acá se lee `persona_plantel` para poder elegir un nombre. El total de
// HH real de la obra NO se suma acá: lo publica `obra_plan_vs_real`, y por actividad lo publica
// `obra_actividad_hh`. Sumarlo también en esta capa sería la segunda versión del mismo número.
//
// ═══ POR QUÉ SE LEE `persona_plantel` Y NO `personas` ═══
//
// `personas` guarda `retribucion_pactada`, `cuil`, `dni`, `fecha_nacimiento`, `art` y `obra_social`.
// Desde el 19/08/2026 la tabla es de Administración por RLS y la obra lee la vista, que publica sólo
// lo operativo: quién es, categoría, especialidad, puesto e ingreso.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Asignacion, Persona, ServiceResult } from '../types'

/**
 * El plantel elegible.
 *
 * NO FILTRA ACÁ. Quién está disponible lo decide `persona_plantel`, que publica sólo a quien tiene
 * `en_la_empresa`. Hasta hoy la regla vivía copiada en este servicio y en el de Administración, cada
 * uno con su `.is('fecha_egreso', null)` — y esa condición dejaba entrar a las 15 personas que se
 * fueron sin baja documentada, porque su fecha de egreso no consta en ningún papel.
 */
export async function getPersonas(supabase: SupabaseClient): Promise<ServiceResult<Persona[]>> {
  const { data, error } = await supabase
    .from('persona_plantel')
    // SIN `puesto`: `persona_plantel` publica CINCO columnas y ninguna más — el contrato lo fija
    // `orquestador/lib/vistas-security-invoker.test.mjs`. Pedir una columna que la vista no tiene
    // no devuelve null: devuelve error, y el selector de asignación queda VACÍO sin decir por qué.
    .select('id, nombre_completo, categoria, especialidad, fecha_egreso')
    .order('nombre_completo', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as Persona[], error: null }
}

/** Las cuadrillas para el selector. Se leen enteras: hay pocas y la lista no depende de la obra. */
export async function getCuadrillas(
  supabase: SupabaseClient,
): Promise<{ id: string; nombre: string; integrantes: number }[]> {
  const { data } = await supabase
    .from('cuadrilla_panel').select('id, nombre, integrantes').eq('activa', true)
    .order('nombre', { ascending: true })
  return (data ?? []) as { id: string; nombre: string; integrantes: number }[]
}

/**
 * Quién está asignado a la obra. El nombre NO se copia: se resuelve contra el plantel.
 *
 * Son dos consultas y no un embed de PostgREST porque el nombre vive en la vista `persona_plantel`,
 * y PostgREST sólo sabe embeber por una clave foránea declarada —que una vista no tiene. Un
 * `personas(...)` embebido seguiría compilando y devolvería `null` para todo el mundo salvo
 * Administración: la pantalla del jefe de obra habría mostrado "persona borrada del legajo" en cada
 * fila, que es el modo de falla más caro de todos, porque parece un dato.
 */
export async function getAsignaciones(supabase: SupabaseClient, obraId?: string): Promise<ServiceResult<Asignacion[]>> {
  // SIN `obraId` DEVUELVE EL PLANTEL DE TODAS LAS OBRAS VISIBLES. Quién ve qué obra lo decide el RLS
  // de `obra_asignacion`, no este `if`.
  const base = supabase.from('obra_asignacion')
    .select('id, obra_id, persona_id, rol, cuadrilla, cuadrilla_id, actividad_id, desde, hasta, ' +
      'notas, cuadrilla_rel:cuadrilla_id(nombre)')
  const { data, error } = await (obraId ? base.eq('obra_id', obraId) : base)
    .order('obra_id', { ascending: true })
    .order('rol', { ascending: true })
  if (error) return { data: null, error: error.message }

  type Cruda = Omit<Asignacion, 'persona_nombre' | 'persona_especialidad' | 'persona_categoria' | 'cuadrilla'> & {
    cuadrilla: string | null
    cuadrilla_rel: { nombre: string } | null
  }
  const crudas = (data ?? []) as unknown as Cruda[]
  const plantel = await plantelDe(supabase, crudas.map((a) => a.persona_id))

  const filas: Asignacion[] = crudas.map((a) => ({
    ...a,
    // El texto legacy ('1', '2') es el respaldo cuando todavía no se migró a la cuadrilla canónica.
    cuadrilla: a.cuadrilla_rel?.nombre ?? a.cuadrilla,
    // El nombre puede faltar si la persona se borró del legajo: se publica el vínculo igual, con el
    // nombre en null. Perder la fila entera escondería una asignación que existe.
    persona_nombre: plantel.get(a.persona_id)?.nombre_completo ?? null,
    persona_especialidad: plantel.get(a.persona_id)?.especialidad ?? null,
    persona_categoria: plantel.get(a.persona_id)?.categoria ?? null,
  }))
  return { data: ordenar(filas), error: null }
}

async function plantelDe(supabase: SupabaseClient, personaIds: (string | null)[]) {
  const ids = [...new Set(personaIds.filter(Boolean))] as string[]
  type Fila = { id: string; nombre_completo: string | null; especialidad: string | null; categoria: string | null }
  const m = new Map<string, Omit<Fila, 'id'>>()
  if (ids.length === 0) return m
  const { data } = await supabase
    .from('persona_plantel').select('id, nombre_completo, especialidad, categoria').in('id', ids)
  for (const p of (data ?? []) as Fila[]) {
    m.set(p.id, { nombre_completo: p.nombre_completo, especialidad: p.especialidad, categoria: p.categoria })
  }
  return m
}

/** Vigentes primero, después responsables, después por nombre. Una asignación cerrada es historia y
 *  no tiene por qué disputarle el primer renglón a quien está trabajando hoy. */
function ordenar(filas: Asignacion[]): Asignacion[] {
  return [...filas].sort((a, b) => {
    if (a.obra_id !== b.obra_id) return a.obra_id.localeCompare(b.obra_id)
    const cerrada = (x: Asignacion) => (x.hasta ? 1 : 0)
    if (cerrada(a) !== cerrada(b)) return cerrada(a) - cerrada(b)
    if (a.rol !== b.rol) return a.rol === 'responsable' ? -1 : 1
    return String(a.persona_nombre ?? '').localeCompare(String(b.persona_nombre ?? ''))
  })
}

/** Una imputación de horas tal como la muestra la obra. */
export interface RegistroHH {
  id: string
  obra_canonica_id: string | null
  persona_id: string | null
  /** TEXTO LEGACY del Sheet de JORNALES. En las filas nuevas es null. */
  trabajador_o_cuadrilla: string | null
  persona_nombre: string | null
  actividad_id: string | null
  actividad_nombre: string | null
  fecha: string | null
  fecha_inicio_semana: string
  horas: number
  /** normal | extra_50 | extra_100 | ausencia | licencia. Ver `services/tipoHora.ts`. */
  tipo_hora: string
  categoria: string | null
  notas: string | null
}

/**
 * El DETALLE de las HH imputadas a la obra, para que el total se pueda auditar.
 *
 * Se filtra por `obra_canonica_id`, no por el `obra_id` legacy: las 19 filas históricas cuelgan de
 * `public.obras` y hasta que alguien las mapee al eje canónico no aparecen acá. Ese vacío es un dato
 * —"nadie imputó HH a esta obra"— y la pantalla lo dice con esas palabras.
 */
export async function getRegistrosHH(supabase: SupabaseClient, obraId?: string): Promise<ServiceResult<RegistroHH[]>> {
  const base = supabase.from('registros_hh')
    .select('id, obra_canonica_id, persona_id, trabajador_o_cuadrilla, actividad_id, fecha, ' +
      'fecha_inicio_semana, horas, tipo_hora, categoria, notas, obra_actividad(nombre)')
  const { data, error } = await (obraId ? base.eq('obra_canonica_id', obraId) : base)
    .not('obra_canonica_id', 'is', null)
    .order('fecha', { ascending: false, nullsFirst: false })
    .order('fecha_inicio_semana', { ascending: false })
  if (error) return { data: null, error: error.message }

  type Cruda = Omit<RegistroHH, 'persona_nombre' | 'actividad_nombre'> & {
    obra_actividad: { nombre: string } | null
  }
  const crudas = (data ?? []) as unknown as Cruda[]
  const plantel = await plantelDe(supabase, crudas.map((r) => r.persona_id))
  return {
    data: crudas.map((r) => ({
      ...r,
      horas: Number(r.horas),
      persona_nombre: r.persona_id ? plantel.get(r.persona_id)?.nombre_completo ?? null : null,
      actividad_nombre: r.obra_actividad?.nombre ?? null,
    })),
    error: null,
  }
}

/** HH plan contra HH real POR ACTIVIDAD. Sale de `obra_actividad_hh`, que es el único cálculo:
 *  lo leen Cronograma y Personal, y por eso no pueden mostrar números distintos. */
export interface ActividadHH {
  actividad_id: string
  obra_id: string
  nombre: string
  tipo: string
  orden: number
  avance_pct: number | null
  hh_plan: number | null
  hh_real: number | null
  /** Cuántas de esas HH reales fueron extras. Sale de la MISMA vista: no se recalcula. */
  hh_extra: number | null
  n_imputaciones: number
  desvio_pct: number | null
  consumo_plan_pct: number | null
}

export async function getActividadHH(
  supabase: SupabaseClient, obraId: string,
): Promise<ServiceResult<ActividadHH[]>> {
  const { data, error } = await supabase
    .from('obra_actividad_hh').select('*').eq('obra_id', obraId).order('orden', { ascending: true })
  if (error) return { data: null, error: error.message }
  return {
    data: ((data ?? []) as ActividadHH[]).map((a) => ({
      ...a,
      hh_plan: a.hh_plan == null ? null : Number(a.hh_plan),
      hh_real: a.hh_real == null ? null : Number(a.hh_real),
      hh_extra: a.hh_extra == null ? null : Number(a.hh_extra),
    })),
    error: null,
  }
}

/**
 * Quiénes integran cada cuadrilla HOY.
 *
 * Se usa para que el parte de ejecución muestre cinco casilleros de horas y no diecisiete: elegir la
 * cuadrilla es lo que convierte una carga de jornada en algo de segundos. Sólo los vínculos
 * vigentes: quien salió de la cuadrilla en marzo no aparece hoy, y su historia queda igual.
 */
export async function getIntegrantesPorCuadrilla(
  supabase: SupabaseClient,
): Promise<Record<string, string[]>> {
  const { data } = await supabase
    .from('cuadrilla_integrante').select('cuadrilla_id, persona_id').is('hasta', null)
  const m: Record<string, string[]> = {}
  for (const f of (data ?? []) as { cuadrilla_id: string; persona_id: string }[]) {
    (m[f.cuadrilla_id] ??= []).push(f.persona_id)
  }
  return m
}
