// LO QUE LEE LA PANTALLA DE PRESENCIA — y de dónde.
//
// Todo sale de `presencia_del_dia`, que corre con los permisos de QUIEN PREGUNTA
// (`security_invoker = true`, migración `20260820T7000`). Acá no hay un solo filtro por rol: si
// mañana se decide que el jefe de obra ve sólo la suya, se cambia la policy de `asistencia_marca` y
// esta pantalla obedece sola. Repetir el criterio en TypeScript sería una segunda definición que se
// desincroniza de la de Postgres y que encima no protege una llamada directa a PostgREST.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '@/features/auth/services/authService'
import type { Esperado, FilaPresencia } from './presencia'

const COLUMNAS = 'persona_id, nombre_completo, categoria, puesto, fecha, obra_id, obra, entrada,'
  + ' salida, incidencias, motivo, lat, lon, precision_m, origen, estado'

/** La migración que crea la vista. Si falta, la pantalla lo dice CON SU NOMBRE en vez de mostrarse
 *  vacía — que se leería como «hoy no vino nadie», que es otra cosa y bastante peor. */
export const MIGRACION = '20260820T7000_donde_empezo_la_jornada'

const faltaLaVista = (e: { code?: string } | null | undefined) =>
  e?.code === '42P01' || e?.code === 'PGRST205' || e?.code === '42703'

export async function getPresencia(
  supabase: SupabaseClient, fecha: string, obraId?: string | null,
): Promise<ServiceResult<FilaPresencia[]>> {
  let consulta = supabase.from('presencia_del_dia').select(COLUMNAS).eq('fecha', fecha)
  if (obraId) consulta = consulta.eq('obra_id', obraId)
  const { data, error } = await consulta
  if (error) {
    if (faltaLaVista(error)) {
      return {
        data: null,
        error: `Todavía no puedo mostrar la presencia: falta aplicar en la base la migración ${MIGRACION}.`
          + ' No es que no haya marcado nadie — es que esta base no tiene la capacidad todavía.',
      }
    }
    return { data: null, error: error.message }
  }
  // `lat`, `lon` y `precision_m` son numeric: llegan como TEXTO. Sin este Number, una comparación
  // de precisión ordenaría «400» antes que «12» y el enlace al mapa saldría con comillas adentro.
  return {
    data: ((data ?? []) as unknown as FilaPresencia[]).map((f) => ({
      ...f,
      lat: f.lat == null ? null : Number(f.lat),
      lon: f.lon == null ? null : Number(f.lon),
      precision_m: f.precision_m == null ? null : Number(f.precision_m),
    })),
    error: null,
  }
}

/**
 * Quiénes se esperaban hoy: el plantel con asignación vigente. Sale de `persona_directorio`, que ya
 * resuelve la obra actual de cada persona y corre con los permisos de quien pregunta.
 *
 * NO es una lista de ausentes y la pantalla no la llama así. Es «no hay marca», que incluye al que
 * no tiene teléfono, al que no le dio permiso al GPS y al que faltó. Quién faltó lo declara el jefe.
 */
export async function getEsperados(
  supabase: SupabaseClient, obraId?: string | null,
): Promise<ServiceResult<Esperado[]>> {
  let consulta = supabase
    .from('persona_directorio')
    .select('id, nombre_completo, categoria, obra_actual_id, obra_actual, cuadrilla')
    .eq('en_la_empresa', true)
    .not('obra_actual_id', 'is', null)
  if (obraId) consulta = consulta.eq('obra_actual_id', obraId)
  const { data, error } = await consulta
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as unknown as Esperado[], error: null }
}

/** Las obras que tienen gente hoy o asignaciones vigentes, para el filtro de la pantalla. */
export async function getObrasConGente(
  supabase: SupabaseClient,
): Promise<ServiceResult<{ id: string; nombre: string }[]>> {
  const { data, error } = await supabase
    .from('obra_canonica').select('id, nombre').eq('estado', 'activa').order('nombre')
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as { id: string; nombre: string }[], error: null }
}
