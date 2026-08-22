// LO QUE EL PERFIL EMPLEADO LEE — y de dónde.
//
// TODO SALE DE LAS VISTAS `mi_*`, que llevan el portero adentro (`20260820T3000` + `20260820T6000`).
// Este archivo NO filtra por persona: si lo hiciera, el filtro estaría en el cliente y la base
// seguiría abierta — una llamada directa a PostgREST devolvería el legajo del plantel entero.
//
// Y NO SE USA LA SERVICE KEY. Es la tentación obvia —«total, filtro por persona_id»— y es
// exactamente la puerta trasera que convierte la RLS en decorativa.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '@/features/auth/services/authService'
import { faltaLaMigracion } from '@/features/mi-cuenta/services/miCuentaService'
import type { DocumentoDelEmpleado } from './documentos'
import type {
  CompaneroDeCuadrilla, DiaDeAsistencia, MiCorreccion, MiImpedimento, MiLegajoCompleto, MiObra,
  MiRecibo, MiTarea,
} from '../types'

/** La migración que crea todo lo del perfil empleado. Si falta, la pantalla lo dice CON SU NOMBRE en
 *  vez de mostrarse vacía — que se leería como «no tenés nada asignado», que es otra cosa. */
export const MIGRACION = '20260820T6000_el_empleado_entra_al_os'

const noDisponible = (que: string) =>
  `Todavía no puedo mostrar ${que}: falta aplicar en la base la migración ${MIGRACION}. `
  + 'No es que no tengas nada — es que esta base no tiene la capacidad todavía.'

/** Una lectura que puede fallar por migración faltante devuelve `data: null` con el motivo dicho,
 *  nunca una lista vacía: VACÍO y NO-DISPONIBLE son dos respuestas distintas y se ven igual. */
function resolver<T>(
  data: T | null,
  error: { code?: string; message: string } | null,
  que: string,
  vacio: T,
): ServiceResult<T> {
  if (!error) return { data: data ?? vacio, error: null }
  if (faltaLaMigracion(error)) return { data: null, error: noDisponible(que) }
  return { data: null, error: error.message }
}

export async function getMiObra(supabase: SupabaseClient): Promise<ServiceResult<MiObra[]>> {
  const { data, error } = await supabase.from('mi_obra').select('*').order('desde', { ascending: false, nullsFirst: false })
  return resolver(data as MiObra[] | null, error, 'tu obra', [])
}

export async function getMiCuadrilla(supabase: SupabaseClient): Promise<ServiceResult<CompaneroDeCuadrilla[]>> {
  // El responsable primero, después el resto por nombre: es como se lee una cuadrilla en obra.
  const { data, error } = await supabase
    .from('mi_cuadrilla')
    .select('*')
    .order('es_responsable', { ascending: false })
    .order('nombre_completo')
  return resolver(data as CompaneroDeCuadrilla[] | null, error, 'tu cuadrilla', [])
}

export async function getMisTareas(supabase: SupabaseClient): Promise<ServiceResult<MiTarea[]>> {
  const { data, error } = await supabase.from('mi_tarea').select('*')
  const r = resolver(data as MiTarea[] | null, error, 'tus tareas', [])
  // `pct` viene como numeric, o sea como texto. Sin este Number, `pct > 50` compara cadenas.
  if (r.data) r.data = r.data.map((t) => ({ ...t, pct: t.pct == null ? null : Number(t.pct) }))
  return r
}

export async function getMiTarea(supabase: SupabaseClient, id: string): Promise<ServiceResult<MiTarea | null>> {
  const { data, error } = await supabase.from('mi_tarea').select('*').eq('id', id).maybeSingle()
  if (error) {
    if (faltaLaMigracion(error)) return { data: null, error: noDisponible('esa tarea') }
    return { data: null, error: error.message }
  }
  const t = data as MiTarea | null
  return { data: t ? { ...t, pct: t.pct == null ? null : Number(t.pct) } : null, error: null }
}

export async function getMisImpedimentos(supabase: SupabaseClient): Promise<ServiceResult<MiImpedimento[]>> {
  const { data, error } = await supabase.from('mi_impedimento').select('*').order('creado_en', { ascending: false })
  return resolver(data as MiImpedimento[] | null, error, 'tus impedimentos', [])
}

export async function getMiLegajo(supabase: SupabaseClient): Promise<ServiceResult<MiLegajoCompleto | null>> {
  const { data, error } = await supabase.from('mi_legajo').select('*').maybeSingle()
  if (error) {
    if (faltaLaMigracion(error)) return { data: null, error: noDisponible('tu legajo') }
    return { data: null, error: error.message }
  }
  return { data: (data as MiLegajoCompleto | null) ?? null, error: null }
}

/** Los días de asistencia de una ventana. El corte va en la CONSULTA: traer tres años de marcas
 *  para mostrar un mes es tráfico que nadie mira. */
export async function getMiAsistencia(
  supabase: SupabaseClient, desde: string, hasta: string,
): Promise<ServiceResult<DiaDeAsistencia[]>> {
  const { data, error } = await supabase
    .from('mi_asistencia_dia').select('*')
    .gte('fecha', desde).lte('fecha', hasta)
    .order('fecha', { ascending: false })
  const r = resolver(data as DiaDeAsistencia[] | null, error, 'tu asistencia', [])
  if (r.data) r.data = r.data.map((d) => ({ ...d, minutos: d.minutos == null ? null : Number(d.minutos) }))
  return r
}

/** El día de hoy, que es lo único que la pantalla Hoy necesita. `null` = todavía no hay ninguna
 *  marca, que NO es lo mismo que un error de lectura — por eso el error viaja aparte. */
export async function getMiDiaDeHoy(
  supabase: SupabaseClient, hoy: string,
): Promise<ServiceResult<DiaDeAsistencia | null>> {
  const { data, error } = await supabase.from('mi_asistencia_dia').select('*').eq('fecha', hoy).maybeSingle()
  if (error) {
    if (faltaLaMigracion(error)) return { data: null, error: noDisponible('tu asistencia') }
    return { data: null, error: error.message }
  }
  const d = data as DiaDeAsistencia | null
  return { data: d ? { ...d, minutos: d.minutos == null ? null : Number(d.minutos) } : null, error: null }
}

/** LA MIGRACIÓN DE M05, aparte de la del perfil: una base con el perfil aplicado y sin ésta muestra
 *  la asistencia entera y sólo se queda sin el pedido de corrección. Decir el nombre correcto es lo
 *  que hace que el mensaje sirva para algo. */
export const MIGRACION_CORRECCION = '20260821T5460_la_salida_que_falta_se_pide_y_la_aprueba_administracion'

/** Mis pedidos de corrección de la ventana que se está mirando. Es lo PEDIDO, no lo corregido: el
 *  efecto de una aprobación se lee en `mi_asistencia_dia`, que ya trae la marca escrita. */
export async function getMisCorrecciones(
  supabase: SupabaseClient, desde: string, hasta: string,
): Promise<ServiceResult<MiCorreccion[]>> {
  const { data, error } = await supabase
    .from('mi_correccion_asistencia').select('*')
    .gte('fecha', desde).lte('fecha', hasta)
    .order('fecha', { ascending: false })
  if (error) {
    if (faltaLaMigracion(error)) {
      return {
        data: null,
        error: `No puedo mostrar tus pedidos de corrección: falta aplicar en la base la migración ${MIGRACION_CORRECCION}.`,
      }
    }
    return { data: null, error: error.message }
  }
  return { data: (data as MiCorreccion[] | null) ?? [], error: null }
}

export async function getMisDocumentos(supabase: SupabaseClient): Promise<ServiceResult<DocumentoDelEmpleado[]>> {
  const { data, error } = await supabase.from('mi_documento_legajo').select('*')
  return resolver(data as DocumentoDelEmpleado[] | null, error, 'tus documentos', [])
}

export async function getMiDocumento(
  supabase: SupabaseClient, id: string,
): Promise<ServiceResult<DocumentoDelEmpleado | null>> {
  const { data, error } = await supabase.from('mi_documento_legajo').select('*').eq('id', id).maybeSingle()
  if (error) {
    if (faltaLaMigracion(error)) return { data: null, error: noDisponible('ese documento') }
    return { data: null, error: error.message }
  }
  return { data: (data as DocumentoDelEmpleado | null) ?? null, error: null }
}

export async function getMisRecibos(supabase: SupabaseClient): Promise<ServiceResult<MiRecibo[]>> {
  const { data, error } = await supabase.from('mi_recibo').select('*')
  const r = resolver(data as MiRecibo[] | null, error, 'tus recibos', [])
  if (r.data) r.data = r.data.map((x) => ({ ...x, neto: x.neto == null ? null : Number(x.neto) }))
  return r
}

/** Los papeles y planos de MI obra. `obra_documento` ya filtra por `ve_obra()` en la base; acá se
 *  acota a la obra donde estoy y se dejan afuera los roles que no son de trabajo — un contrato o un
 *  presupuesto no son «documentos de obra» para quien la ejecuta. */
export const ROLES_DE_TRABAJO = ['plano', 'plan', 'tecnico', 'otro'] as const

export async function getDocumentosDeMiObra(
  supabase: SupabaseClient, obraId: string,
): Promise<ServiceResult<{ drive_file_id: string; nombre: string | null; rol: string | null; creado_en: string }[]>> {
  const { data, error } = await supabase
    .from('obra_documento')
    .select('drive_file_id, nombre, rol, creado_en')
    .eq('obra_id', obraId)
    .order('creado_en', { ascending: false })
    .limit(20)
  return resolver(
    data as { drive_file_id: string; nombre: string | null; rol: string | null; creado_en: string }[] | null,
    error, 'los documentos de tu obra', [],
  )
}
