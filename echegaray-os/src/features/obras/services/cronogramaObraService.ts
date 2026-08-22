// LO QUE EL CRONOGRAMA NECESITA DE LA BASE — cinco lecturas y ninguna cuenta.
//
// Las cuentas viven en `cronogramaMotor.ts` (puro, probado) y en el motor de
// `orquestador/lib/cronograma.mjs`. Acá sólo se LEE, y se lee con la sesión del usuario: la RLS de
// `obra_actividad_control` es la que decide qué obra ve un jefe de obra, y la que ya hace cumplir
// que no vea costo ni margen. Por eso este servicio recibe el `SupabaseClient` y no abre una
// conexión propia.
//
// Las cinco lecturas van en paralelo. En serie, la pantalla espera cinco veces por algo que no
// depende de lo anterior.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '../types/index.ts'
import type {
  ActividadCruda, DependenciaCruda, InsumosCronograma, ObraCruda,
} from './cronogramaMotor.ts'

/** Sólo las columnas que el motor usa. Pedir `*` traería el ancho entero de la vista de control
 *  —incluidas columnas que otra pantalla podría considerar económicas— por comodidad. */
const COLUMNAS = [
  'actividad_id', 'nombre', 'tipo', 'actividad_padre_id', 'orden', 'rubro', 'seccion',
  'hh_plan', 'hh_real', 'avance_pct', 'dias_plan',
  'inicio_plan', 'fin_plan', 'inicio_base', 'fin_base', 'inicio_real', 'fin_real',
  'estado', 'cuadrilla_id', 'cuadrilla_prevista', 'cantidad_objetivo', 'unidad',
  'dotacion_prevista', 'tope_frente', 'impedimentos_abiertos', 'tiempo_tecnico',
].join(', ')

/** `pg` y PostgREST devuelven las columnas `date` de formas distintas. Todo lo que entra al motor
 *  se normaliza a `AAAA-MM-DD`: comparar «2026-07-08» con «Wed Jul 08 2026» ordena mal y en
 *  silencio. */
const CAMPOS_FECHA = ['inicio_plan', 'fin_plan', 'inicio_base', 'fin_base', 'inicio_real', 'fin_real']

function normalizarFechas(fila: unknown): ActividadCruda {
  const salida = { ...(fila as Record<string, unknown>) }
  for (const c of CAMPOS_FECHA) {
    const v = salida[c]
    if (typeof v === 'string' && v.length > 10) salida[c] = v.slice(0, 10)
  }
  return salida as unknown as ActividadCruda
}

/**
 * Todo lo que el motor necesita de una obra. Devuelve el error de la lectura que falló, con su
 * nombre: «no pude leer el cronograma» sin decir cuál de las cinco tablas es un mensaje que no
 * deja arreglar nada.
 */
export async function getInsumosCronograma(
  supabase: SupabaseClient, obraId: string,
): Promise<ServiceResult<InsumosCronograma>> {
  const [obra, actividades, dependencias, feriados] = await Promise.all([
    supabase.from('obra_canonica')
      .select('id, jornada_horas, dias_habiles, fecha_inicio_plan').eq('id', obraId).maybeSingle(),
    supabase.from('obra_actividad_control')
      .select(COLUMNAS).eq('obra_id', obraId).eq('archivada', false).order('orden').limit(2000),
    supabase.from('obra_dependencia')
      // El `id` viaja porque la 07 ahora deja QUITAR una precedencia, y `quitarDependencia` borra
      // por id. Sin él, la pantalla mostraría la relación y no podría deshacerla.
      .select('id, origen_id, destino_id, tipo, lag_dias').eq('obra_id', obraId).limit(2000),
    supabase.from('calendario_no_laborable').select('fecha, alcance, obra_id').limit(2000),
  ])

  if (obra.error) return { data: null, error: `no pude leer la obra: ${obra.error.message}` }
  if (!obra.data) return { data: null, error: `la obra ${obraId} no existe` }
  if (actividades.error) return { data: null, error: `no pude leer las actividades: ${actividades.error.message}` }
  if (dependencias.error) return { data: null, error: `no pude leer las dependencias: ${dependencias.error.message}` }
  if (feriados.error) return { data: null, error: `no pude leer el calendario: ${feriados.error.message}` }

  const crudas = (actividades.data ?? []).map(normalizarFechas)
  const conCapacidad = await conCapacidadPonderada(supabase, crudas)

  // El filtro por obra del calendario se hace acá y no en el `select` porque PostgREST no expresa
  // «de alcance general O de ESTA obra» en un `.or()` sin ambigüedad de tipos sobre `obra_id`.
  const noLaborables = (feriados.data ?? [])
    .filter((f) => (f as { alcance?: string }).alcance !== 'obra' || (f as { obra_id?: string }).obra_id === obraId)
    .map((f) => String((f as { fecha: string }).fecha).slice(0, 10))

  return {
    data: {
      obra: obra.data as unknown as ObraCruda,
      actividades: conCapacidad,
      dependencias: (dependencias.data ?? []) as unknown as DependenciaCruda[],
      noLaborables,
    },
    error: null,
  }
}

/**
 * LA CAPACIDAD PONDERADA DE LA CUADRILLA DE CADA ACTIVIDAD.
 *
 * Va en una lectura aparte porque PostgREST no hace este join: `cuadrilla_capacidad` es una vista y
 * `obra_actividad_control` otra, sin relación declarada entre ambas. Si ninguna actividad tiene
 * cuadrilla —que es hoy el caso en las 17 obras— no se consulta nada.
 */
async function conCapacidadPonderada(
  supabase: SupabaseClient, actividades: ActividadCruda[],
): Promise<ActividadCruda[]> {
  const ids = [...new Set(actividades.map((a) => a.cuadrilla_id).filter((x): x is string => Boolean(x)))]
  if (!ids.length) return actividades
  const { data } = await supabase
    .from('cuadrilla_capacidad').select('cuadrilla_id, capacidad_ponderada').in('cuadrilla_id', ids)
  const porId = new Map(
    (data ?? []).map((c) => [
      (c as { cuadrilla_id: string }).cuadrilla_id,
      (c as { capacidad_ponderada: number | null }).capacidad_ponderada,
    ]),
  )
  return actividades.map((a) => (
    a.cuadrilla_id ? { ...a, capacidad_ponderada: porId.get(a.cuadrilla_id) ?? null } : a
  ))
}

export interface CategoriaCapacidad {
  /** La clave de `categoria_obra` — la MISMA que `personas.categoria`. Sin ella el factor no se
   *  puede pegar a una persona, que es lo que necesita la 21 para escribir el peso al lado de cada
   *  integrante: `nombre` es texto para mostrar, no una clave. */
  clave: string
  nombre: string
  factor: number
}

/** Los factores de capacidad, de la tabla `categoria_obra`. Se muestran en la 08 y en la 21 porque
 *  son la razón por la que cuatro personas no son cuatro: sin verlos, el número parece arbitrario. */
export async function getCapacidadPonderada(
  supabase: SupabaseClient,
): Promise<ServiceResult<CategoriaCapacidad[]>> {
  const { data, error } = await supabase
    .from('categoria_obra').select('clave, nombre, capacidad').eq('activa', true).order('capacidad', { ascending: false })
  if (error) return { data: null, error: error.message }
  return {
    data: (data ?? []).map((c) => ({
      clave: (c as { clave: string }).clave,
      nombre: (c as { nombre: string }).nombre,
      factor: Number((c as { capacidad: number }).capacidad),
    })),
    error: null,
  }
}

/** Cuánta gente tiene la obra hoy, para poder decir «pediste 17 y la obra tiene 14». Sin
 *  asignaciones vigentes devuelve null — «sin dato», no cero personas. */
export async function getPersonasDisponibles(
  supabase: SupabaseClient, obraId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from('obra_asignacion').select('persona_id').eq('obra_id', obraId).is('hasta', null).limit(500)
  if (error || !data) return null
  const gente = new Set(data.map((a) => (a as { persona_id: string }).persona_id))
  return gente.size ? gente.size : null
}
