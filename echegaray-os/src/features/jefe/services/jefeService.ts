// LO QUE LEEN LAS SEIS PANTALLAS DEL JEFE DE OBRA — y de dónde.
//
// ═══ ACÁ NO HAY UN SOLO FILTRO POR ROL ═══
//
// Todo sale de vistas con `security_invoker = true`, que corren con los permisos de QUIEN PREGUNTA:
// `obra_wbs`, `obra_actividad_control`, `obra_dependencia_legible`, `presencia_del_dia`. El alcance
// del jefe —sus obras— lo decide `ve_obra()` en Postgres. Repetir el criterio en TypeScript sería
// una segunda definición que se desincroniza y que encima no protege una llamada directa a
// PostgREST.
//
// ═══ NO SE PIDE UNA SOLA COLUMNA DE DINERO ═══
//
// `obra_panel` publica `monto_contratado` y `costo_real`, y `obra_economia` la venta y el margen.
// Ninguna se
// nombra en este archivo. No es por prudencia: es que la lista de columnas de un `select` es la
// única parte del contrato que se puede leer de un vistazo, y la que un revisor puede verificar sin
// levantar la base. La cerradura sigue siendo `ve_economia()`.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '@/features/auth/services/authService'
import type { EstadoFecha } from '@/features/obras/types'
import type { NodoArbol } from './frentes.ts'
import type { Metodo, TareaDelDia } from './medicion.ts'

/** Una obra en el selector del encabezado. Sin un solo importe. */
export interface ObraDelJefe {
  id: string
  nombre: string
  estado: string
  etapa: string | null
  avance_pct: number | null
  n_actividades: number
  n_actividades_medidas: number
  restricciones_abiertas: number
  fecha_fin_plan: string | null
}

const COLUMNAS_OBRA =
  'obra_id, nombre, estado, etapa, avance_pct, n_actividades, n_actividades_medidas,'
  + ' restricciones_abiertas, fecha_fin_plan'

/** Las obras que el jefe ve. El orden es el de trabajo: activas primero, después por nombre. */
export async function getObrasDelJefe(supabase: SupabaseClient): Promise<ServiceResult<ObraDelJefe[]>> {
  const { data, error } = await supabase.from('obra_panel').select(COLUMNAS_OBRA).order('nombre')
  if (error) return { data: null, error: error.message }
  const filas = (data ?? []).map((o) => {
    const f = o as unknown as Record<string, unknown>
    return {
      id: String(f.obra_id),
      nombre: String(f.nombre ?? f.obra_id),
      estado: String(f.estado ?? ''),
      etapa: (f.etapa as string | null) ?? null,
      avance_pct: numero(f.avance_pct),
      n_actividades: Number(f.n_actividades ?? 0),
      n_actividades_medidas: Number(f.n_actividades_medidas ?? 0),
      restricciones_abiertas: Number(f.restricciones_abiertas ?? 0),
      fecha_fin_plan: (f.fecha_fin_plan as string | null) ?? null,
    }
  })
  const peso = (o: ObraDelJefe) => (o.estado === 'activa' ? 0 : o.estado === 'pausada' ? 1 : 2)
  return { data: filas.sort((a, b) => peso(a) - peso(b) || a.nombre.localeCompare(b.nombre, 'es')), error: null }
}

/** El árbol de la obra, en orden constructivo. `ruta_orden` es un arreglo: ordena por rama. */
export async function getArbol(supabase: SupabaseClient, obraId: string): Promise<ServiceResult<NodoArbol[]>> {
  const { data, error } = await supabase
    .from('obra_wbs')
    .select('actividad_id, actividad_padre_id, nombre, camino, nivel, archivada, es_contenedor, ruta_orden')
    .eq('obra_id', obraId)
    .order('ruta_orden')
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as unknown as NodoArbol[], error: null }
}

/** Una actividad tal como la mira el jefe: qué es, cómo va, cómo se mide y quién la tiene. */
export interface ActividadDelJefe extends TareaDelDia {
  obra_id: string
  rubro: string | null
  origen_avance: string | null
  estado_operativo: string
  n_pasos: number
  n_pasos_hechos: number
  cuadrilla_prevista: string | null
  /** El peso de la tarea. Entra en el avance ponderado del frente (`avance.ts`). NO es costo. */
  hh_plan: number | null
  hh_real: number | null
  inicio_plan: string | null
  fin_plan: string | null
  /** Evidencia, nunca futuro: de `actividad_fechas`. */
  inicio_real: string | null
  fin_real: string | null
  forecast_fin: string | null
  estado_fecha: EstadoFecha | null
  ultimo_parte: string | null
  unidad: string | null
  cantidad_objetivo: number | null
  cantidad_ejecutada: number | null
}

// `inicio_real`/`fin_real` salen de `actividad_fechas` (evidencia, nunca futuro): son las que usan
// `diasDeAtraso` y «terminada el …». Con la columna cruda de la tabla —vacía en las 350 filas— una
// tarea cerrada hace dos semanas se publicaba como terminada SIN FECHA y una abierta hace un mes no
// se distinguía de una que no arrancó.
const COLUMNAS_ACTIVIDAD =
  'actividad_id, obra_id, nombre, tipo, rubro, metodo_avance, avance_pct, origen_avance,'
  + ' estado_operativo, impedimentos_abiertos, n_pasos, n_pasos_hechos, cuadrilla_prevista,'
  + ' hh_plan, hh_real, inicio_plan, fin_plan, inicio_real, fin_real, forecast_fin, estado_fecha,'
  + ' ultimo_parte, unidad, cantidad_objetivo, cantidad_ejecutada'

export async function getActividades(
  supabase: SupabaseClient, obraId: string,
): Promise<ServiceResult<ActividadDelJefe[]>> {
  const { data, error } = await supabase
    .from('obra_actividad_control').select(COLUMNAS_ACTIVIDAD)
    .eq('obra_id', obraId).eq('archivada', false).order('orden')
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []).map(aActividad), error: null }
}

export async function getActividad(
  supabase: SupabaseClient, actividadId: string,
): Promise<ServiceResult<ActividadDelJefe | null>> {
  const { data, error } = await supabase
    .from('obra_actividad_control').select(COLUMNAS_ACTIVIDAD).eq('actividad_id', actividadId).maybeSingle()
  if (error) return { data: null, error: error.message }
  return { data: data ? aActividad(data) : null, error: null }
}

// Los numeric de PostgREST llegan como TEXTO. Sin este Number, «100» ordena antes que «20» y una
// barra de avance con un string adentro se dibuja al 0 % sin avisar.
function aActividad(o: unknown): ActividadDelJefe {
  const f = o as Record<string, unknown>
  return {
    actividad_id: String(f.actividad_id),
    obra_id: String(f.obra_id),
    nombre: String(f.nombre ?? ''),
    tipo: String(f.tipo ?? 'tarea'),
    rubro: (f.rubro as string | null) ?? null,
    metodo_avance: (f.metodo_avance as Metodo | null) ?? null,
    avance_pct: numero(f.avance_pct),
    origen_avance: (f.origen_avance as string | null) ?? null,
    estado_operativo: String(f.estado_operativo ?? ''),
    impedimentos_abiertos: Number(f.impedimentos_abiertos ?? 0),
    n_pasos: Number(f.n_pasos ?? 0),
    n_pasos_hechos: Number(f.n_pasos_hechos ?? 0),
    cuadrilla_prevista: (f.cuadrilla_prevista as string | null) ?? null,
    hh_plan: numero(f.hh_plan),
    hh_real: numero(f.hh_real),
    inicio_plan: (f.inicio_plan as string | null) ?? null,
    fin_plan: (f.fin_plan as string | null) ?? null,
    inicio_real: (f.inicio_real as string | null) ?? null,
    fin_real: (f.fin_real as string | null) ?? null,
    forecast_fin: (f.forecast_fin as string | null) ?? null,
    estado_fecha: (f.estado_fecha as EstadoFecha | null) ?? null,
    ultimo_parte: (f.ultimo_parte as string | null) ?? null,
    unidad: (f.unidad as string | null) ?? null,
    cantidad_objetivo: numero(f.cantidad_objetivo),
    cantidad_ejecutada: numero(f.cantidad_ejecutada),
  }
}

const numero = (v: unknown): number | null => (v == null ? null : Number(v))

/** Los pasos ponderados de una actividad. Vacío no es un error: casi ninguna los tiene todavía. */
export interface PasoDeActividad {
  id: string
  orden: number
  nombre: string
  peso: number
  tiempo_tecnico: boolean
  hecho_en: string | null
}

export async function getPasos(
  supabase: SupabaseClient, actividadId: string,
): Promise<ServiceResult<PasoDeActividad[]>> {
  const { data, error } = await supabase
    .from('obra_actividad_paso')
    .select('id, orden, nombre, peso, tiempo_tecnico, hecho_en')
    .eq('actividad_id', actividadId).order('orden')
  if (error) return { data: null, error: error.message }
  return {
    data: (data ?? []).map((p) => {
      const f = p as Record<string, unknown>
      return {
        id: String(f.id), orden: Number(f.orden ?? 0), nombre: String(f.nombre ?? ''),
        peso: Number(f.peso ?? 1), tiempo_tecnico: Boolean(f.tiempo_tecnico),
        hecho_en: (f.hecho_en as string | null) ?? null,
      }
    }),
    error: null,
  }
}

/** Una línea de «Últimos partes» (J06): qué se cargó ese día contra la tarea, y con qué método. */
export interface ParteDeTarea {
  id: string
  fecha: string
  cantidad: number | null
  avance_pct: number | null
  metodo: string | null
  comentario: string | null
}

/**
 * LOS ÚLTIMOS PARTES DE UNA TAREA — el bloque «Últimos partes» que dibuja J06.
 *
 * Sale de `obra_ejecucion`, que guarda HECHOS de un día: cada fila es lo que se cargó ESE día, no
 * el acumulado. Por eso la pantalla los escribe con `+`: «+0,18 m³» es producción del 20/08, y
 * sumarlos da el acumulado — que es exactamente lo que hace la vista de control.
 *
 * Se piden cinco: en 390px entran tres sin desplazar y el resto es contexto.
 */
export async function getUltimosPartes(
  supabase: SupabaseClient, actividadId: string, limite = 5,
): Promise<ServiceResult<ParteDeTarea[]>> {
  const { data, error } = await supabase
    .from('obra_ejecucion')
    .select('id, fecha, cantidad, avance_pct, metodo, comentario')
    .eq('actividad_id', actividadId)
    .order('fecha', { ascending: false })
    .limit(limite)
  if (error) return { data: null, error: error.message }
  return {
    data: (data ?? []).map((p) => {
      const f = p as Record<string, unknown>
      return {
        id: String(f.id),
        fecha: String(f.fecha ?? ''),
        cantidad: numero(f.cantidad),
        avance_pct: numero(f.avance_pct),
        metodo: (f.metodo as string | null) ?? null,
        comentario: (f.comentario as string | null) ?? null,
      }
    }),
    error: null,
  }
}

/**
 * La relación EN PALABRAS, tal como la escribe la base.
 *
 * La frase no se arma acá a propósito: `obra_dependencia_legible` ya la redacta, y si el texto
 * viviera en el front cada pantalla —el teléfono, el escritorio, el chat— inventaría el suyo.
 */
export async function getDependencias(
  supabase: SupabaseClient, actividadId: string,
): Promise<ServiceResult<{ id: string; relacion: string; origen: string }[]>> {
  const { data, error } = await supabase
    .from('obra_dependencia_legible').select('id, relacion, origen').eq('destino_id', actividadId)
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as { id: string; relacion: string; origen: string }[], error: null }
}

/** Un impedimento abierto de la obra. Es lo que frena el trabajo, y por eso abre «Resolver hoy». */
export interface Impedimento {
  id: string
  descripcion: string | null
  tipo: string | null
  actividad_id: string | null
  creado_en: string | null
  responsable: string | null
  fecha_necesidad: string | null
  fecha_compromiso: string | null
}

export async function getImpedimentos(
  supabase: SupabaseClient, obraId: string,
): Promise<ServiceResult<Impedimento[]>> {
  const { data, error } = await supabase
    .from('obra_restriccion')
    .select('id, descripcion, tipo, actividad_id, creado_en, responsable, fecha_necesidad, fecha_compromiso')
    .eq('obra_id', obraId).is('fecha_liberacion', null).order('creado_en')
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as unknown as Impedimento[], error: null }
}

/**
 * Quién trabajó HOY en cada actividad, según las horas imputadas.
 *
 * ═══ ES EL ÚNICO VÍNCULO REAL ENTRE UNA PERSONA Y UN FRENTE ═══
 *
 * El modelo no tiene «persona asignada a un frente»: `obra_asignacion` la asigna a la OBRA y
 * `cuadrilla` no cuelga de ninguna actividad. Lo que sí es un hecho registrado es la imputación de
 * horas contra `actividad_id`, y es lo que se usa. Por eso la pantalla no dice «gente del frente»
 * sino «imputó horas hoy»: es lo que el dato afirma, ni más ni menos.
 */
export interface HHDelDia {
  persona_id: string
  actividad_id: string
  horas: number
  tipo_hora: string
}

export async function getHHDelDia(
  supabase: SupabaseClient, obraId: string, fecha: string,
): Promise<ServiceResult<HHDelDia[]>> {
  const { data, error } = await supabase
    .from('registros_hh').select('persona_id, actividad_id, horas, tipo_hora')
    .eq('obra_canonica_id', obraId).eq('fecha', fecha)
    .not('persona_id', 'is', null).not('actividad_id', 'is', null)
  if (error) return { data: null, error: error.message }
  return {
    data: (data ?? []).map((h) => {
      const f = h as Record<string, unknown>
      return {
        persona_id: String(f.persona_id), actividad_id: String(f.actividad_id),
        horas: Number(f.horas ?? 0), tipo_hora: String(f.tipo_hora ?? 'normal'),
      }
    }),
    error: null,
  }
}
