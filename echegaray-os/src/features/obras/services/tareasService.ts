// EL WORKSPACE DE TAREAS — el acceso a datos del árbol de la obra y del panel de una actividad.
//
// ═══ EL ÁRBOL SE CRUZA, NO SE REARMA ═══
//
// Son DOS lecturas y un cruce por id: `obra_wbs` da la forma (nivel, camino, orden constructivo) y
// `obra_actividad_control` da el contenido (avance calculado, HH, impedimentos, pasos). El orden lo
// impone la vista con `ruta_orden`; acá no se ordena de nuevo. Rearmar la recursión en TypeScript
// sería una segunda definición de la estructura de la obra: el día que la migración cambie el
// criterio de orden, la pantalla seguiría mostrando el viejo sin un solo error.
//
// ═══ CAMINO CRÍTICO: LO QUE HOY NO SE PUEDE AFIRMAR ═══
//
// `es_critica` sale en `false` para todas y NO es un olvido. El camino crítico exige precedencias
// declaradas, y `obra_dependencia` tiene **cero filas en las cinco obras con cronograma**
// (21/08/2026). Además, el motor que lo calcula (`orquestador/lib/cronograma.mjs`) todavía no
// materializa su resultado en Postgres, y la web de este repo nunca importa un motor del
// orquestador: lee lo que el motor dejó en la base. Deducir la criticidad de las fechas sería
// inventar una secuencia que nadie declaró — dos actividades consecutivas pueden serlo sólo porque
// comparten cuadrilla. La vista «Camino crítico» lo dice con todas las letras en vez de mentir.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Actividad, ServiceResult } from '../types'
import type { NodoObra, RolEstructura } from './wbs'

interface FilaWbs {
  actividad_id: string
  actividad_padre_id: string | null
  nivel: number
  camino: string
  es_contenedor: boolean
  tiene_hijas: boolean
  archivada: boolean
}

/** La composición productiva prevista. La cuadrilla canónica manda; el texto legacy ('1', '2') que
 *  quedó en `obra_actividad.cuadrilla` es el respaldo mientras haya actividades sin migrar. */
function cuadrillaDe(a: Actividad): string | null {
  return a.cuadrilla_prevista ?? a.cuadrilla ?? null
}

function aNodo(
  w: FilaWbs, a: Actividad, subcontratista: string | undefined, responsable: string | null,
): NodoObra {
  return {
    id: w.actividad_id,
    padre_id: w.actividad_padre_id,
    nivel: w.nivel,
    camino: w.camino,
    es_contenedor: w.es_contenedor,
    tiene_hijas: w.tiene_hijas,
    nombre: a.nombre,
    tipo: a.tipo,
    rol_estructura: (a.rol_estructura ?? null) as RolEstructura | null,
    partida_codigo: a.partida_codigo ?? a.codigo,
    unidad: a.unidad,
    cantidad_objetivo: a.cantidad_objetivo,
    cantidad_ejecutada: a.cantidad_ejecutada,
    hh_plan: a.hh_plan,
    hh_real: a.hh_real,
    metodo_avance: a.metodo_avance,
    avance_pct: a.avance_pct,
    fin_plan: a.fin_plan,
    responsable,
    cuadrilla: cuadrillaDe(a),
    subcontratista: subcontratista ?? null,
    es_subcontrato: subcontratista !== undefined,
    estado: a.estado_operativo === 'bloqueada' ? null : (a.estado_operativo ?? null),
    impedimentos_abiertos: a.impedimentos_abiertos,
    n_pasos: a.n_pasos ?? 0,
    n_pasos_hechos: a.n_pasos_hechos ?? 0,
    peso_pasos: a.peso_pasos ?? null,
    analisis_id: a.analisis_id ?? null,
    tarea_tipo_id: a.tarea_tipo_id ?? null,
    cotizacion_partida_id: a.cotizacion_partida_id ?? null,
    tope_frente: a.tope_frente ?? null,
    dotacion_prevista: a.dotacion_prevista ?? null,
    cuadrilla_id: a.cuadrilla_id ?? null,
    // `undefined` mientras la migración del tiempo técnico no esté aplicada: el `select *` de
    // PostgREST devuelve las columnas que existan. Se lee como `false`, que es el default de la
    // columna — no como «no sé», porque el cálculo tiene que poder correr igual.
    tiempo_tecnico: a.tiempo_tecnico === true,
    dias_plan: a.dias_plan ?? null,
    // Ver la cabecera: sin una sola precedencia declarada no hay camino crítico que afirmar.
    es_critica: false,
  }
}

/** Qué actividades ejecuta un subcontratista, y cuál. Hoy la tabla está vacía: es lo que hay que
 *  mostrar, no algo que se deduzca de que una actividad se llame «Yesería». */
async function subcontratistasPorActividad(
  supabase: SupabaseClient, obraId: string,
): Promise<Map<string, string>> {
  const { data: paquetes } = await supabase
    .from('subcontrato').select('id, nombre, proveedor_texto').eq('obra_id', obraId)
  const porId = new Map((paquetes ?? []).map((p) => [
    p.id as string, ((p.proveedor_texto as string) || (p.nombre as string) || 'subcontratista'),
  ]))
  if (porId.size === 0) return new Map()
  const { data: alcance } = await supabase
    .from('subcontrato_alcance').select('actividad_id, subcontrato_id')
    .in('subcontrato_id', [...porId.keys()])
  const salida = new Map<string, string>()
  for (const l of alcance ?? []) {
    const nombre = porId.get(l.subcontrato_id as string)
    if (l.actividad_id && nombre) salida.set(l.actividad_id as string, nombre)
  }
  return salida
}

/** EL NOMBRE DEL RESPONSABLE, contra `persona_plantel`.
 *
 * La vista `obra_actividad_control` publica `responsable_id` y no el nombre, así que sin esta
 * lectura la pantalla sólo tendría un uuid — y eso es lo que llevó a rellenar RESPONSABLE con la
 * cuadrilla, que sí venía con nombre. `persona_plantel` es la ÚNICA puerta a los nombres del
 * plantel (misma que usa `personalService`): no se lee `personas`, cuya RLS es de Administración.
 *
 * Un id que la vista no devuelve queda en `null` y la pantalla escribe «sin asignar»: quien no está
 * en el plantel vigente no puede seguir figurando como responsable de una actividad en curso.
 */
async function nombresDeResponsables(
  supabase: SupabaseClient, ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data } = await supabase
    .from('persona_plantel').select('id, nombre_completo').in('id', ids)
  return new Map((data ?? []).map((p) => [p.id as string, p.nombre_completo as string]))
}

/**
 * EL ÁRBOL DE LA OBRA, en orden constructivo y sin las archivadas.
 *
 * Archivada NO es borrada: sale de la lista y su historia queda. Se filtra acá —una sola vez— y no
 * en cada vista, que es como se llega a que dos pantallas cuenten distinta cantidad de actividades.
 */
export async function getArbol(
  supabase: SupabaseClient, obraId: string,
): Promise<ServiceResult<NodoObra[]>> {
  const [wbs, control, subs] = await Promise.all([
    supabase.from('obra_wbs')
      .select('actividad_id, actividad_padre_id, nivel, camino, es_contenedor, tiene_hijas, archivada')
      .eq('obra_id', obraId).order('ruta_orden', { ascending: true }),
    supabase.from('obra_actividad_control').select('*').eq('obra_id', obraId),
    subcontratistasPorActividad(supabase, obraId),
  ])
  if (wbs.error) return { data: null, error: wbs.error.message }
  if (control.error) return { data: null, error: control.error.message }

  const porId = new Map((control.data ?? []).map((a) => [a.actividad_id as string, a as Actividad]))
  // Los ids se juntan de la MISMA lectura y se resuelven de una sola vez: una consulta por
  // actividad serían 275 viajes en san-francisco para pintar una columna.
  const nombres = await nombresDeResponsables(
    supabase,
    [...new Set([...porId.values()].map((a) => a.responsable_id).filter((v): v is string => Boolean(v)))],
  )
  const nodos: NodoObra[] = []
  for (const w of (wbs.data ?? []) as FilaWbs[]) {
    if (w.archivada) continue
    const a = porId.get(w.actividad_id)
    if (!a) continue
    nodos.push(aNodo(
      w, a, subs.get(w.actividad_id),
      a.responsable_id ? nombres.get(a.responsable_id) ?? null : null,
    ))
  }
  return { data: nodos, error: null }
}

export interface PasoDeActividad {
  id: string
  orden: number
  nombre: string
  peso: number
  tiempo_tecnico: boolean
  dias_tecnicos: number | null
  hecho_en: string | null
}

export async function getPasos(
  supabase: SupabaseClient, actividadId: string,
): Promise<ServiceResult<PasoDeActividad[]>> {
  const { data, error } = await supabase
    .from('obra_actividad_paso')
    .select('id, orden, nombre, peso, tiempo_tecnico, dias_tecnicos, hecho_en')
    .eq('actividad_id', actividadId).order('orden', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as PasoDeActividad[], error: null }
}

export interface RelacionLegible {
  id: string
  origen_id: string
  destino_id: string
  origen: string
  destino: string
  /** LA RELACIÓN EN PALABRAS, DESDE LA BASE. Si el texto se armara acá, cada pantalla inventaría
   *  el suyo y un día dejarían de coincidir. La sigla (FS/SS/FF/SF) no se muestra nunca. */
  relacion: string
  /** LA SIGLA NO SE MUESTRA: SE EDITA. Viaja para poder abrir el selector de «Cambiar relación» en
   *  lo que la dependencia ES hoy — un desplegable que arranca siempre en FS haría que cambiar la
   *  demora de una SS la convierta en FS sin que nadie lo pida. */
  tipo: 'FS' | 'SS' | 'FF' | 'SF'
  lag_dias: number
}

export async function getRelaciones(
  supabase: SupabaseClient, obraId: string,
): Promise<ServiceResult<RelacionLegible[]>> {
  const { data, error } = await supabase
    .from('obra_dependencia_legible')
    .select('id, origen_id, destino_id, origen, destino, relacion, tipo, lag_dias').eq('obra_id', obraId)
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as RelacionLegible[], error: null }
}

export interface RegistroAvance {
  id: string
  fecha: string
  creado_en: string
  cantidad: number | null
  avance_pct: number | null
  comentario: string | null
  criterio: string | null
  metodo: string | null
  fuente: string | null
  masivo: boolean
  autor: string | null
  /** Los enlaces de la evidencia (`obra_ejecucion.evidencia`, `text[]`). El OS NO guarda archivos:
   *  el papel vive en Drive y acá queda su enlace. Ver la nota de la solapa Avance en el panel. */
  evidencia: string[]
}

/**
 * EL HISTORIAL de una actividad: qué se registró, cuándo, con qué método y quién lo firma.
 *
 * `creado_por` viene NULL en los 242 registros anteriores al 21/08/2026 —la columna recién ahora
 * tiene `default auth.uid()`— y eso se muestra como «sin firma», no como el nombre de nadie.
 */
export async function getHistorial(
  supabase: SupabaseClient, actividadId: string,
): Promise<ServiceResult<RegistroAvance[]>> {
  const { data, error } = await supabase
    .from('obra_ejecucion')
    .select('id, fecha, creado_en, cantidad, avance_pct, comentario, criterio, metodo, fuente, masivo, creado_por, evidencia')
    .eq('actividad_id', actividadId)
    .order('fecha', { ascending: false }).order('creado_en', { ascending: false })
  if (error) return { data: null, error: error.message }
  const ids = [...new Set((data ?? []).map((r) => r.creado_por as string | null).filter(Boolean))] as string[]
  const nombres = new Map<string, string>()
  if (ids.length > 0) {
    const { data: usuarios } = await supabase
      .from('perfiles').select('id, nombre').in('id', ids)
    for (const u of usuarios ?? []) nombres.set(u.id as string, u.nombre as string)
  }
  const filas: RegistroAvance[] = (data ?? []).map((r) => ({
    id: r.id as string,
    fecha: r.fecha as string,
    creado_en: r.creado_en as string,
    cantidad: r.cantidad as number | null,
    avance_pct: r.avance_pct as number | null,
    comentario: r.comentario as string | null,
    criterio: (r.criterio as string) ?? null,
    metodo: (r.metodo as string) ?? null,
    fuente: (r.fuente as string) ?? null,
    masivo: Boolean(r.masivo),
    autor: r.creado_por ? (nombres.get(r.creado_por as string) ?? null) : null,
    evidencia: Array.isArray(r.evidencia) ? (r.evidencia as string[]).filter(Boolean) : [],
  }))
  return { data: filas, error: null }
}

export interface AvanceMalImputado {
  id: string
  actividad_id: string
  actividad: string
  fecha: string
  avance_pct: number | null
  cantidad: number | null
}

/**
 * LOS SEIS AVANCES CARGADOS CONTRA UN CONTENEDOR, antes de que la regla existiera.
 *
 * No son un error de quien los cargó: la pantalla se lo permitía. Se muestran para que alguien los
 * reimpute a la actividad que corresponde; esconderlos dejaría trabajo declarado fuera de todo
 * total sin que nadie se entere.
 */
export async function getAvancesSobreContenedor(
  supabase: SupabaseClient, obraId: string,
): Promise<AvanceMalImputado[]> {
  const { data } = await supabase
    .from('obra_ejecucion_sobre_contenedor')
    .select('id, actividad_id, actividad, fecha, avance_pct, cantidad')
    .eq('obra_id', obraId).order('fecha', { ascending: false })
  return (data ?? []) as AvanceMalImputado[]
}
