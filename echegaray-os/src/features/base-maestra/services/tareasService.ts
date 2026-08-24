// BASE MAESTRA · TAREAS TIPO — el acceso a datos de la pantalla 17. Cero SQL nuevo.
//
// Todo lo que se calcula ya está calculado en Postgres y acá NO se vuelve a calcular:
// `analisis_costo` da el costo directo, su desglose y las `hs_unitarias`; `analisis_incompleto` da
// la deuda de carga; `rendimiento_recomendado` da la cadena teórico → real → recomendado con su
// muestra. Este módulo lee, empareja por id y traduce a la forma que la pantalla pinta.
//
// ═══ EL CORTE ECONÓMICO NO SE HACE ACÁ, PERO SÍ SE DECLARA ═══
//
// `recurso_precio` sólo abre para `ve_economia()`. Un jefe de obra recibe cero filas SIN ERROR, así
// que todos los costos llegan en null — indistinguible de «nadie los cargó». Por eso cada lectura
// devuelve también si quien mira ve economía: es lo único que permite que la pantalla escriba «sin
// permiso» en vez de mandar a cargar de nuevo 409 precios que ya están cargados.

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CostoAnalisis, FichaTarea, LineaAnalisis, Plantilla, Rendimiento, ServiceResult, TareaTipoFila,
  UsoDeTarea, VersionAnalisis,
} from '../types'
import { estadoDelAnalisis, faltaOperativa } from './reglas'

type Fila = Record<string, unknown>
const n = (v: unknown): number | null => (v == null ? null : Number(v))
const s = (v: unknown): string | null => (v == null ? null : String(v))

/**
 * EL LISTADO COMPLETO, EN UNA SOLA LECTURA POR FUENTE.
 *
 * Se traen las 4 fuentes enteras y se emparejan en memoria en vez de pedir una consulta por tarea:
 * son ~223 tareas y ~400 recursos, un volumen que entra en una respuesta y que permite que el
 * buscador filtre MIENTRAS SE ESCRIBE sin volver al servidor en cada tecla.
 */
export async function getTareasTipo(
  supabase: SupabaseClient,
  economia: boolean,
): Promise<ServiceResult<TareaTipoFila[]>> {
  const [tareas, costos, incompletos, rendimientos] = await Promise.all([
    supabase.from('tarea_tipo').select('*').eq('activo', true).order('codigo'),
    supabase.from('analisis_costo').select('*').eq('vigente', true),
    supabase.from('analisis_incompleto').select('codigo, falta'),
    supabase.from('rendimiento_recomendado').select('tarea_tipo_id, hs_observado_mediana, hs_recomendado, muestra'),
  ])

  // UN ERROR DE LECTURA NO SE PINTA COMO LISTA VACÍA. Son lo opuesto: una base caída se vería igual
  // que una base maestra sin cargar, y la diferencia entre las dos es todo.
  if (tareas.error) return { data: null, error: tareas.error.message }
  if (costos.error) return { data: null, error: costos.error.message }

  const costoPorTarea = new Map<string, Fila>()
  for (const c of (costos.data ?? []) as Fila[]) costoPorTarea.set(String(c.tarea_tipo_id), c)
  const faltaPorCodigo = new Map<string, string | null>()
  for (const i of (incompletos.data ?? []) as Fila[]) faltaPorCodigo.set(String(i.codigo), s(i.falta))
  const rendPorTarea = new Map<string, Fila>()
  for (const r of (rendimientos.data ?? []) as Fila[]) rendPorTarea.set(String(r.tarea_tipo_id), r)

  const filas = ((tareas.data ?? []) as Fila[]).map((t): TareaTipoFila => {
    const c = costoPorTarea.get(String(t.id))
    const r = rendPorTarea.get(String(t.id))
    return {
      id: String(t.id),
      codigo: String(t.codigo),
      nombre: String(t.nombre),
      unidad: String(t.unidad),
      division: s(t.division),
      metodo_medicion: s(t.metodo_medicion),
      descripcion: s(t.descripcion),
      hs_unitarias: c ? n(c.hs_unitarias) : null,
      hs_observado: r ? n(r.hs_observado_mediana) : null,
      hs_recomendado: r ? n(r.hs_recomendado) : null,
      muestra: r ? Number(r.muestra ?? 0) : 0,
      estado: estadoDelAnalisis(Boolean(c), faltaDe(c, faltaPorCodigo.get(String(t.codigo)), economia)),
      falta: faltaDe(c, faltaPorCodigo.get(String(t.codigo)), economia),
      analisis_id: c ? String(c.analisis_id) : null,
      version: c ? n(c.version) : null,
    }
  })
  return { data: filas, error: null }
}

/**
 * Qué le falta a este análisis, DICHO PARA QUIEN LO MIRA.
 *
 * Con permiso económico manda `analisis_incompleto`, que es la fuente. Sin permiso, la vista no es
 * confiable —su criterio de precio se dispara para todas las tareas porque la RLS le vacía
 * `recurso_precio`— y se usa el espejo operativo, que sólo mira lo que no depende del precio.
 * El porqué completo está en `reglas.ts` §1b, y es una deuda del modelo.
 */
function faltaDe(costo: Fila | undefined, faltaVista: string | null | undefined, economia: boolean): string | null {
  if (!costo) return null
  if (economia) return faltaVista ?? null
  return faltaOperativa({
    n_lineas: Number(costo.n_lineas ?? 0),
    tiene_mano_obra: Boolean(costo.tiene_mano_obra),
    tiene_cargas_sociales: Boolean(costo.tiene_cargas_sociales),
    hs_unitarias: n(costo.hs_unitarias),
  })
}

/** LA FICHA — todo lo que las seis solapas necesitan, en paralelo. */
export async function getFichaTarea(
  supabase: SupabaseClient,
  tareaId: string,
  economia: boolean,
): Promise<ServiceResult<FichaTarea>> {
  const { data: t, error } = await supabase.from('tarea_tipo').select('*').eq('id', tareaId).maybeSingle()
  if (error) return { data: null, error: error.message }
  if (!t) return { data: null, error: 'Esa tarea tipo no existe' }

  const [costos, incompleto, versiones, rendimiento] = await Promise.all([
    supabase.from('analisis_costo').select('*').eq('tarea_tipo_id', tareaId),
    supabase.from('analisis_incompleto').select('codigo, falta').eq('codigo', String((t as Fila).codigo)).maybeSingle(),
    supabase.from('analisis').select('id, version, vigente, motivo, autor, creado_en')
      .eq('tarea_tipo_id', tareaId).order('version', { ascending: false }),
    supabase.from('rendimiento_recomendado').select('*').eq('tarea_tipo_id', tareaId).maybeSingle(),
  ])
  if (costos.error) return { data: null, error: costos.error.message }

  const porAnalisis = new Map<string, Fila>()
  for (const c of (costos.data ?? []) as Fila[]) porAnalisis.set(String(c.analisis_id), c)
  const vigente = ((costos.data ?? []) as Fila[]).find((c) => c.vigente === true)
  const falta = faltaDe(vigente, s(incompleto.data?.falta), economia)

  const avisos: string[] = []
  const lineas = vigente ? await getLineas(supabase, String(vigente.analisis_id), avisos) : []
  const plantilla = await getPlantillaDe(supabase, s((t as Fila).division), avisos)
  const uso = await getUso(supabase, tareaId, avisos)

  const tarea: TareaTipoFila = {
    id: String((t as Fila).id),
    codigo: String((t as Fila).codigo),
    nombre: String((t as Fila).nombre),
    unidad: String((t as Fila).unidad),
    division: s((t as Fila).division),
    metodo_medicion: s((t as Fila).metodo_medicion),
    descripcion: s((t as Fila).descripcion),
    hs_unitarias: vigente ? n(vigente.hs_unitarias) : null,
    hs_observado: n(rendimiento.data?.hs_observado_mediana),
    hs_recomendado: n(rendimiento.data?.hs_recomendado),
    muestra: Number(rendimiento.data?.muestra ?? 0),
    estado: estadoDelAnalisis(Boolean(vigente), falta),
    falta,
    analisis_id: vigente ? String(vigente.analisis_id) : null,
    version: vigente ? n(vigente.version) : null,
  }

  return {
    data: {
      tarea,
      lineas,
      costo: vigente ? aCosto(vigente) : null,
      versiones: aVersiones((versiones.data ?? []) as Fila[], porAnalisis),
      rendimiento: rendimiento.data ? aRendimiento(rendimiento.data as Fila) : null,
      plantilla,
      uso,
      avisos,
    },
    error: null,
  }
}

/**
 * LA COMPOSICIÓN. La unidad de cada línea la pone el RECURSO, no la línea: así lo decidió el
 * modelo para que no puedan discrepar, y por eso se lee de `recurso_costo` y no de `analisis_linea`.
 */
async function getLineas(supabase: SupabaseClient, analisisId: string, avisos: string[]): Promise<LineaAnalisis[]> {
  const { data, error } = await supabase
    .from('analisis_linea').select('id, recurso_id, cantidad, orden, nota')
    .eq('analisis_id', analisisId).order('orden')
  if (error) { avisos.push(`No pude leer la composición: ${error.message}`); return [] }
  const ids = [...new Set((data ?? []).map((l) => String((l as Fila).recurso_id)))]
  if (!ids.length) return []

  const { data: recursos } = await supabase.from('recurso_costo').select('*').in('recurso_id', ids)
  const porId = new Map<string, Fila>()
  for (const r of (recursos ?? []) as Fila[]) porId.set(String(r.recurso_id), r)

  return ((data ?? []) as Fila[]).map((l): LineaAnalisis => {
    const r = porId.get(String(l.recurso_id))
    return {
      id: String(l.id),
      recurso_id: String(l.recurso_id),
      // El recurso puede no llegar: `recurso` es legible por todos, así que si falta es que se
      // borró, no que el permiso lo escondió. Se dice, no se rellena con un nombre inventado.
      codigo: r ? String(r.codigo) : '—',
      nombre: r ? String(r.nombre) : 'recurso que ya no existe',
      unidad: r ? String(r.unidad) : '',
      tipo: (r ? String(r.tipo) : 'otro') as LineaAnalisis['tipo'],
      familia: r ? s(r.familia) : null,
      cantidad: Number(l.cantidad),
      orden: Number(l.orden ?? 0),
      nota: s(l.nota),
      desperdicio: r ? Number(r.desperdicio ?? 0) : 0,
      costo_base: r ? n(r.costo_base) : null,
      costo_con_desperdicio: r ? n(r.costo_con_desperdicio) : null,
      fecha_precio: r ? s(r.fecha_precio) : null,
      fuente: r ? s(r.fuente) : null,
    }
  })
}

/**
 * LA PLANTILLA DE SECUENCIA de esta tipología. Se empareja por `division` contra el nombre de la
 * plantilla, que es el único vínculo que el modelo tiene hoy: `tarea_tipo` NO guarda una referencia
 * a `plantilla_secuencia`. Es una deuda declarada en el informe, no una invención: si no empareja,
 * la solapa dice que no hay plantilla asignada en vez de mostrar la de otra tipología.
 */
async function getPlantillaDe(
  supabase: SupabaseClient, division: string | null, avisos: string[],
): Promise<Plantilla | null> {
  if (!division) return null
  const { data, error } = await supabase
    .from('plantilla_secuencia')
    .select('id, nombre, descripcion, se_repite_por, activa, plantilla_paso(orden, nombre, peso, tiempo_tecnico, dias_tecnicos)')
    .ilike('nombre', division).maybeSingle()
  if (error) { avisos.push(`No pude leer la plantilla de secuencia: ${error.message}`); return null }
  if (!data) return null
  const f = data as Fila
  const pasos = ((f.plantilla_paso ?? []) as Fila[])
    .map((p) => ({
      orden: Number(p.orden), nombre: String(p.nombre), peso: Number(p.peso),
      tiempo_tecnico: Boolean(p.tiempo_tecnico), dias_tecnicos: n(p.dias_tecnicos),
    }))
    .sort((a, b) => a.orden - b.orden)
  return {
    id: String(f.id), nombre: String(f.nombre), descripcion: s(f.descripcion),
    se_repite_por: (f.se_repite_por as string[]) ?? null, activa: Boolean(f.activa), pasos,
  }
}

/**
 * DÓNDE SE ESTÁ USANDO. `obra_actividad.tarea_tipo_id` es la trazabilidad que dejó la conversión:
 * cada actividad guarda de qué tarea tipo salió.
 *
 * UNA LECTURA QUE FALLA SE AVISA, NO SE CONVIERTE EN «no se usa en ninguna obra» — son dos
 * afirmaciones opuestas y la segunda habilitaría a editar un análisis creyendo que no toca nada.
 * Y la RLS de `obra_actividad` se acota por obra: un jefe de obra ve su obra y no las demás, así
 * que esta lista puede estar RECORTADA sin error. Por eso el aviso dice de qué se está hablando.
 */
async function getUso(supabase: SupabaseClient, tareaId: string, avisos: string[]): Promise<UsoDeTarea[]> {
  const { data, error } = await supabase
    .from('obra_actividad')
    .select('obra_id, nombre, cantidad_objetivo, unidad, estado, partida_codigo, obra:obra_canonica(nombre)')
    .eq('tarea_tipo_id', tareaId)
    .eq('archivada', false)
    .limit(50)
  if (error) {
    avisos.push(`No pude leer dónde se usa esta tarea: ${error.message}`)
    return []
  }
  return ((data ?? []) as Fila[]).map((a) => ({
    obra_id: s(a.obra_id),
    obra_nombre: s((a.obra as Fila | null)?.nombre) ?? s(a.obra_id) ?? 'obra sin identificar',
    referencia: s(a.partida_codigo) ?? s(a.nombre),
    estado: s(a.estado),
    cantidad: n(a.cantidad_objetivo),
    unidad: s(a.unidad),
  }))
}

function aCosto(c: Fila): CostoAnalisis {
  return {
    n_lineas: Number(c.n_lineas ?? 0),
    n_lineas_sin_precio: Number(c.n_lineas_sin_precio ?? 0),
    costo_directo: n(c.costo_directo),
    costo_mano_obra: n(c.costo_mano_obra),
    costo_cargas_sociales: n(c.costo_cargas_sociales),
    costo_materiales: n(c.costo_materiales),
    costo_equipos: n(c.costo_equipos),
    hs_unitarias: n(c.hs_unitarias),
    precio_mas_viejo: s(c.precio_mas_viejo),
    tiene_mano_obra: Boolean(c.tiene_mano_obra),
    tiene_cargas_sociales: Boolean(c.tiene_cargas_sociales),
  }
}

function aVersiones(filas: Fila[], porAnalisis: Map<string, Fila>): VersionAnalisis[] {
  return filas.map((v) => ({
    id: String(v.id),
    version: Number(v.version),
    vigente: Boolean(v.vigente),
    motivo: s(v.motivo),
    creado_en: String(v.creado_en),
    // El nombre del autor NO vive en `analisis`: es un uuid. Se resuelve en la pantalla contra
    // `perfiles` sólo si hace falta; acá queda en null, que es «sin firma», no un nombre inventado.
    autor_nombre: null,
    hs_unitarias: n(porAnalisis.get(String(v.id))?.hs_unitarias),
  }))
}

function aRendimiento(r: Fila): Rendimiento {
  return {
    hs_analisis: n(r.hs_analisis),
    muestra: Number(r.muestra ?? 0),
    obras: Number(r.obras ?? 0),
    hs_observado_promedio: n(r.hs_observado_promedio),
    hs_observado_mediana: n(r.hs_observado_mediana),
    dispersion: n(r.dispersion),
    hs_recomendado: n(r.hs_recomendado),
    lectura: String(r.lectura ?? 'sin dato'),
    ultima_muestra: r.ultima_muestra == null ? null : String(r.ultima_muestra),
    hh_improductivas: n(r.hh_improductivas_de_la_muestra),
  }
}
