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
import { rotuloDeObra } from '../../../shared/utils/obra.ts'

const COLUMNAS = 'persona_id, nombre_completo, nombre_para_mostrar, categoria, puesto, fecha, obra_id, obra, entrada,'
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
  const gps = ((data ?? []) as unknown as FilaPresencia[])
  // ═══ LA ASISTENCIA CARGADA TAMBIÉN ES PRESENCIA (dueño, 24/09/2026) ═══
  // Esta vista lee sólo las fichadas con GPS (`asistencia_marca`), y hoy nadie ficha: el jefe carga
  // «Está» en Cargar asistencia (`asistencia_dia`). El «Hoy» del jefe decía «0 en obra de 3 · 3 personas
  // sin registrar» con los tres cargados presentes — «está mezclando lógicas, tablas, todo mal», dueño.
  // Una fichada manda (trae la hora); sin fichada, lo cargado cuenta: presente = en obra (o jornada
  // cerrada si no es hoy) y ausente = declarado, que deja de figurar como «sin registrar».
  const cargada = await presenciaCargada(supabase, fecha, obraId, new Set(gps.map((g) => g.persona_id)))
  // `lat`, `lon` y `precision_m` son numeric: llegan como TEXTO. Sin este Number, una comparación
  // de precisión ordenaría «400» antes que «12» y el enlace al mapa saldría con comillas adentro.
  return {
    data: [...gps, ...cargada].map((f) => ({
      ...f,
      lat: f.lat == null ? null : Number(f.lat),
      lon: f.lon == null ? null : Number(f.lon),
      precision_m: f.precision_m == null ? null : Number(f.precision_m),
    })),
    error: null,
  }
}

/** La fecha de hoy en San Juan, como la guarda la base. */
const hoySanJuan = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/San_Juan', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

/**
 * LO QUE CARGÓ EL JEFE EN «CARGAR ASISTENCIA», como filas de presencia, para quien no fichó con GPS.
 * Un ausente declarado vuelve con estado `sin_registrar`: no entra en ningún grupo de los que se ven
 * como «vino», y sale de «sin registrar» porque el jefe ya dijo qué pasó. Si la lectura falla, no se
 * inventa nada: se devuelve vacío y la pantalla queda como antes.
 */
async function presenciaCargada(
  supabase: SupabaseClient, fecha: string, obraId: string | null | undefined, conFichada: Set<string>,
): Promise<FilaPresencia[]> {
  let q = supabase.from('asistencia_dia').select('persona_id, fecha, obra_canonica_id, estado, origen').eq('fecha', fecha)
  if (obraId) q = q.eq('obra_canonica_id', obraId)
  const { data, error } = await q
  if (error || !data?.length) return []
  const filas = (data as { persona_id: string; fecha: string; obra_canonica_id: string | null; estado: string | null; origen: string | null }[])
    .filter((a) => !conFichada.has(a.persona_id))
  if (!filas.length) return []
  const ids = [...new Set(filas.map((a) => a.persona_id))]
  const obras = [...new Set(filas.map((a) => a.obra_canonica_id).filter((o): o is string => !!o))]
  const [dir, obs] = await Promise.all([
    supabase.from('persona_directorio').select('id, nombre_completo, nombre_para_mostrar, categoria, puesto').in('id', ids),
    obras.length ? supabase.from('obra_canonica').select('id, nombre, codigo').in('id', obras) : Promise.resolve({ data: [] }),
  ])
  const persona = new Map(((dir.data ?? []) as { id: string; nombre_completo: string; categoria: string | null; puesto: string | null }[]).map((p) => [p.id, p]))
  const obra = new Map(((obs.data ?? []) as { id: string; nombre: string; codigo?: string | null }[]).map((o) => [o.id, o]))
  const esHoy = fecha === hoySanJuan()
  return filas.map((a) => {
    const p = persona.get(a.persona_id)
    const o = a.obra_canonica_id ? obra.get(a.obra_canonica_id) : undefined
    const presente = (a.estado ?? '').toLowerCase() === 'presente'
    return {
      persona_id: a.persona_id, nombre_completo: p?.nombre_completo ?? '', categoria: p?.categoria ?? null,
      puesto: p?.puesto ?? null, fecha: a.fecha, obra_id: a.obra_canonica_id,
      obra: o ? rotuloDeObra({ codigo: o.codigo ?? null, nombre: o.nombre }) : null,
      entrada: null, salida: null, incidencias: 0, motivo: null, lat: null, lon: null, precision_m: null,
      origen: 'cargada por el jefe',
      estado: presente ? (esHoy ? 'activo' : 'cerrada') : 'sin_registrar',
    } satisfies FilaPresencia
  })
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
    .select('id, nombre_completo, nombre_para_mostrar, categoria, obra_actual_id, obra_actual, cuadrilla')
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
    .from('obra_canonica').select('id, nombre, codigo').eq('estado', 'activa').order('nombre')
  if (error) return { data: null, error: error.message }
  const filas = (data ?? []) as { id: string; nombre: string; codigo: string | null }[]
  return { data: filas.map((o) => ({ id: o.id, nombre: rotuloDeObra(o) })), error: null }
}
