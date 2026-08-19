// PERSONAS — la lectura del módulo Personal.
//
// ═══ DOS LECTURAS DISTINTAS, A PROPÓSITO ═══
//
// El LISTADO sale de `persona_directorio`, que no publica DNI, CUIL ni sueldo: la tabla global no
// los muestra (*"NO mostrar en la tabla DNI, CUIL, sueldo, teléfono, documentación ni métricas"*) y
// lo que la pantalla no muestra tampoco viaja al navegador. Hereda el RLS de `personas` por
// `security_invoker = true`, así que es de Administración sin necesidad de un `where` propio.
//
// La FICHA lee `persona_legajo`, NO la tabla. El motivo es mecánico: `authenticated` es un solo rol
// de Postgres para los cuatro roles de la aplicación, así que el grant por columna de `personas` le
// niega `dni` y `cuil` a todo el mundo por igual —incluida Administración—. `persona_legajo` corre
// como su dueño y lleva el portero adentro (`where es_administracion()`): es el único camino de la
// web a esos dos campos, y está declarado y fijado por
// `orquestador/lib/vistas-security-invoker.test.mjs`.
//
// LA ESCRITURA SÍ VA CONTRA LA TABLA: los grants de INSERT/UPDATE por columna nunca se cerraron, y
// quién puede escribir lo decide la RLS.

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AsignacionDePersona, DocumentoLegajo, Persona, PersonaEnDirectorio, ServiceResult,
} from '../types'

const COLUMNAS_FICHA =
  'id, nombre_completo, dni, cuil, fecha_nacimiento, nacionalidad, telefono, email, domicilio, ' +
  'contacto_emergencia, contacto_emergencia_telefono, fecha_ingreso, fecha_egreso, ' +
  'convenio_colectivo, categoria, especialidad, puesto, modalidad_liquidacion, notas, ' +
  'legajo, en_la_empresa, drive_folder_id'

/** Los cuatro filtros del dueño. `todos` es literal: incluye a los que ya no están, y la columna
 *  ESTADO los distingue. Esconder a los inactivos detrás de un filtro llamado "todos" es la clase
 *  de mentira chica que después hace dudar de la lista entera. */
export type FiltroPersonal = 'todos' | 'en_obra' | 'sin_asignar' | 'inactivos'

export const FILTROS: { valor: FiltroPersonal; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'en_obra', etiqueta: 'En obra' },
  { valor: 'sin_asignar', etiqueta: 'Sin asignar' },
  { valor: 'inactivos', etiqueta: 'Inactivos' },
]

/** Los ids cuyo DNI o CUIL contiene lo buscado.
 *
 *  El listado NO trae el documento, pero buscar por documento es como Administración identifica a
 *  alguien cuando le llega un papel. Se resuelve contra `personas` —que sólo Administración lee— y
 *  se aplica como filtro de ids sobre el directorio: el dato se usa, no se publica. */
async function idsPorDocumento(supabase: SupabaseClient, q: string): Promise<string[]> {
  const digitos = q.replace(/\D/g, '')
  if (digitos.length < 4) return []
  const { data } = await supabase
    .from('persona_legajo').select('id').or(`dni.ilike.%${digitos}%,cuil.ilike.%${digitos}%`)
  return (data ?? []).map((f) => (f as { id: string }).id)
}

export async function getDirectorio(
  supabase: SupabaseClient,
  filtro: FiltroPersonal = 'todos',
  q?: string,
): Promise<ServiceResult<PersonaEnDirectorio[]>> {
  let consulta = supabase.from('persona_directorio').select('*')

  // QUIÉN ESTÁ SE PREGUNTA POR `en_la_empresa`, NO POR LA FECHA. De los 43 legajos fuera de la
  // nómina, 15 se fueron sin baja documentada: con `fecha_egreso is null` los 15 volvían al plantel.
  consulta = consulta.eq('en_la_empresa', filtro !== 'inactivos')
  if (filtro === 'en_obra') consulta = consulta.not('obra_actual_id', 'is', null)
  if (filtro === 'sin_asignar') consulta = consulta.is('obra_actual_id', null)

  // Las comas separan condiciones en un `or` de PostgREST: un término con coma partiría el filtro
  // en dos y devolvería resultados de más.
  const busqueda = q?.replace(/[,()]/g, ' ').trim()
  if (busqueda) {
    const ids = await idsPorDocumento(supabase, busqueda)
    const condiciones = [`nombre_completo.ilike.%${busqueda}%`, `cuadrilla.ilike.%${busqueda}%`]
    if (ids.length > 0) condiciones.push(`id.in.(${ids.join(',')})`)
    consulta = consulta.or(condiciones.join(','))
  }

  const { data, error } = await consulta.order('nombre_completo', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as PersonaEnDirectorio[], error: null }
}

export async function getPersona(supabase: SupabaseClient, id: string): Promise<ServiceResult<Persona | null>> {
  const { data, error } = await supabase.from('persona_legajo').select(COLUMNAS_FICHA).eq('id', id).maybeSingle()
  if (error) return { data: null, error: error.message }
  // `persona_legajo` es una VISTA: PostgREST no le conoce el tipo de fila y el cliente lo infiere
  // como un error genérico. El casteo va por `unknown` a propósito — el contrato de columnas lo fija
  // `vistas-security-invoker.test.mjs`, no este archivo.
  return { data: (data as unknown as Persona) ?? null, error: null }
}

/**
 * El historial de asignaciones, vigentes y cerradas.
 *
 * Es la MISMA tabla que lee `Obra → Personal`. Los nombres de la obra, la actividad y la cuadrilla
 * se resuelven con embeds de PostgREST porque las tres son claves foráneas declaradas —a diferencia
 * de la persona, que vive en una vista y no se puede embeber.
 */
export async function getAsignacionesDe(
  supabase: SupabaseClient,
  personaId: string,
): Promise<ServiceResult<AsignacionDePersona[]>> {
  const { data, error } = await supabase
    .from('obra_asignacion')
    .select('id, obra_id, rol, cuadrilla, cuadrilla_id, actividad_id, desde, hasta, notas, ' +
      'obra_canonica(nombre), obra_actividad(nombre), cuadrilla_rel:cuadrilla_id(nombre)')
    .eq('persona_id', personaId)
    .order('hasta', { ascending: true, nullsFirst: true })
    .order('desde', { ascending: false, nullsFirst: false })
  if (error) return { data: null, error: error.message }

  type Cruda = {
    id: string; obra_id: string; rol: string | null; cuadrilla: string | null
    cuadrilla_id: string | null; actividad_id: string | null; desde: string | null
    hasta: string | null; notas: string | null
    obra_canonica: { nombre: string } | null
    obra_actividad: { nombre: string } | null
    // El embed va con ALIAS y no como `cuadrilla(...)`: la columna de texto legacy se llama igual,
    // y PostgREST devolvería una sola de las dos —silenciosamente— si compartieran nombre.
    cuadrilla_rel: { nombre: string } | null
  }
  return {
    data: ((data ?? []) as unknown as Cruda[]).map((f) => ({
      id: f.id,
      obra_id: f.obra_id,
      obra_nombre: f.obra_canonica?.nombre ?? null,
      rol: f.rol,
      cuadrilla_id: f.cuadrilla_id,
      // El texto legacy es el respaldo: las tres asignaciones cargadas hoy dicen '1' y '2'.
      cuadrilla: f.cuadrilla_rel?.nombre ?? f.cuadrilla,
      actividad_id: f.actividad_id,
      actividad_nombre: f.obra_actividad?.nombre ?? null,
      desde: f.desde,
      hasta: f.hasta,
      notas: f.notas,
    })),
    error: null,
  }
}

/** Los documentos del legajo. El archivo NO se copia: se guarda el id de Drive y se abre allá. */
export async function getDocumentos(
  supabase: SupabaseClient,
  personaId: string,
): Promise<ServiceResult<DocumentoLegajo[]>> {
  const { data, error } = await supabase
    .from('documentacion_legajo')
    .select('id, tipo_documento, nombre, drive_file_id, fecha_documento, presente, notas')
    .eq('persona_id', personaId)
    .order('fecha_documento', { ascending: false, nullsFirst: false })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as DocumentoLegajo[], error: null }
}

/** Las categorías que de verdad hay cargadas, para poder filtrar por una que exista —incluidas las
 *  tres fuera de convenio, que si no serían invisibles y nadie las corregiría. */
export async function getCategoriasEnUso(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.from('persona_directorio').select('categoria').not('categoria', 'is', null)
  const set = new Set((data ?? []).map((f) => (f as { categoria: string }).categoria))
  return [...set].sort()
}
