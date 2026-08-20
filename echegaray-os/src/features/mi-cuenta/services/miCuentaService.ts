// LO QUE MI CUENTA LEE — y de dónde.
//
// TODO SALE DE LAS VISTAS `mi_*`, que llevan el portero adentro (`20260820T3000`). Este archivo NO
// filtra por persona: si lo hiciera, el filtro estaría en el cliente y la base seguiría abierta —
// una llamada directa a PostgREST devolvería el legajo de todos. El filtro es de la base y sólo de
// la base; acá se lee lo que la base ya acotó.
//
// Y NO SE USA LA SERVICE KEY. Es la tentación obvia —«total, filtro por persona_id»— y es
// exactamente la puerta trasera que convierte la RLS en decorativa: con la service key, un `eq()`
// mal escrito publica el legajo de otro y ninguna policy lo detiene.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '@/features/auth/services/authService'
import type { AsignacionPropia, DocumentoLegajo, HoraPropia, LegajoPropio, PerfilPropio } from '../types'

/** La migración que crea las vistas `mi_*`. Si falta, la pantalla lo dice con su nombre en vez de
 *  mostrar un legajo vacío que se leería como «no tenés nada cargado». */
export const MIGRACION = '20260820T3000_cada_uno_ve_lo_suyo_y_solo_lo_suyo'

/** 42P01 = la relación no existe (Postgres). PGRST205 = PostgREST no la conoce en su esquema.
 *  Son la misma falta: la migración está en el repositorio y no en esta base. */
export function faltaLaMigracion(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST204' || error?.code === '42703'
}

const mensajeDeMigracion = (que: string) =>
  `Todavía no puedo mostrar ${que}: falta aplicar en la base la migración ${MIGRACION}. `
  + 'No es que no tengas nada cargado — es que esta base no tiene la capacidad todavía.'

/** Una lectura que puede fallar por migración faltante devuelve `data: null` con el motivo dicho,
 *  nunca una lista vacía: vacío y no-disponible son dos respuestas distintas y se ven igual. */
function resolver<T>(
  data: T | null,
  error: { code?: string; message: string } | null,
  que: string,
  vacio: T,
): ServiceResult<T> {
  if (!error) return { data: data ?? vacio, error: null }
  if (faltaLaMigracion(error)) return { data: null, error: mensajeDeMigracion(que) }
  return { data: null, error: error.message }
}

export async function getPerfilPropio(supabase: SupabaseClient, userId: string): Promise<ServiceResult<PerfilPropio | null>> {
  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre, rol, telefono, avatar_url, persona_id')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    // Las tres columnas nuevas pueden no existir todavía. El perfil SÍ existe: se lee lo básico y la
    // cuenta sigue usable, porque quedarse sin pantalla por un teléfono es peor que no tener el
    // teléfono.
    if (faltaLaMigracion(error)) {
      const basico = await supabase.from('perfiles').select('id, nombre, rol').eq('id', userId).maybeSingle()
      if (basico.error) return { data: null, error: basico.error.message }
      if (!basico.data) return { data: null, error: null }
      // `vinculoDisponible: false` es la diferencia entre «no te vincularon» y «esta base no puede
      // vincular todavía». Sin ella, la pantalla mandaría a la persona a pedirle a Administración
      // algo que Administración no puede hacer hasta que se aplique la migración.
      return {
        data: {
          ...(basico.data as { id: string; nombre: string; rol: string }),
          telefono: null, avatar_url: null, persona_id: null, vinculoDisponible: false,
        },
        error: null,
      }
    }
    return { data: null, error: error.message }
  }
  if (!data) return { data: null, error: null }
  return { data: { ...(data as Omit<PerfilPropio, 'vinculoDisponible'>), vinculoDisponible: true }, error: null }
}

export async function getLegajoPropio(supabase: SupabaseClient): Promise<ServiceResult<LegajoPropio | null>> {
  const { data, error } = await supabase.from('mi_legajo').select('*').maybeSingle()
  if (error) {
    if (faltaLaMigracion(error)) return { data: null, error: mensajeDeMigracion('tu legajo') }
    return { data: null, error: error.message }
  }
  return { data: (data as LegajoPropio | null) ?? null, error: null }
}

export async function getAsignacionesPropias(supabase: SupabaseClient): Promise<ServiceResult<AsignacionPropia[]>> {
  // Lo vigente primero y, dentro de cada grupo, lo más reciente arriba: la pregunta de todos los
  // días es «¿dónde estoy hoy?», no «¿dónde estuve en 2019?».
  const { data, error } = await supabase
    .from('mi_asignacion')
    .select('*')
    .order('vigente', { ascending: false })
    .order('desde', { ascending: false, nullsFirst: false })
  return resolver(data as AsignacionPropia[] | null, error, 'tus asignaciones', [])
}

/** Las horas de la ventana, ambas puntas inclusive. El corte va en la CONSULTA y no en memoria:
 *  traer tres años de imputaciones para mostrar un mes es tráfico que nadie mira. */
export async function getHorasPropias(
  supabase: SupabaseClient,
  desde: string,
  hasta: string,
): Promise<ServiceResult<HoraPropia[]>> {
  const { data, error } = await supabase
    .from('mi_hh_dia')
    .select('id, fecha, obra_id, obra, actividad_id, actividad, tipo_hora, horas, notas')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })
  if (error) {
    if (faltaLaMigracion(error)) return { data: null, error: mensajeDeMigracion('tus horas') }
    return { data: null, error: error.message }
  }
  // `horas` viene como `numeric`, o sea como texto: sin este `Number` el total sería una
  // concatenación de cadenas y `8` + `8` daría `88`.
  return {
    data: ((data ?? []) as HoraPropia[]).map((f) => ({ ...f, horas: Number(f.horas) })),
    error: null,
  }
}

export async function getDocumentosPropios(supabase: SupabaseClient): Promise<ServiceResult<DocumentoLegajo[]>> {
  const { data, error } = await supabase
    .from('mi_documento_legajo')
    .select('id, tipo_documento, nombre, presente, drive_file_id, fecha_documento, fecha_vencimiento')
  return resolver(data as DocumentoLegajo[] | null, error, 'tus documentos', [])
}
