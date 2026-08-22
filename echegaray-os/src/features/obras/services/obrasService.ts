// MÓDULO 01 — OBRAS · el acceso a datos.
//
// CERO SQL NUEVO Y CERO DATO FABRICADO. Todo sale de estructuras canónicas: la vista `obra_panel`
// (que a su vez cruza `obra_canonica` con `obra_costo_real`), y las tablas `obra_actividad`,
// `obra_restriccion` y `obra_documento`. No se lee `public.obras` legacy en ninguna consulta — es la
// tabla que tenía las 4 obras pausadas y hacía que la web dijera "0 obras activas" mientras cuatro
// obras facturaban $287M.
//
// Los documentos se resuelven contra `drive_index`, que es el espejo del Drive: el archivo NO se
// copia ni se sirve desde acá, sólo se enlaza.

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Actividad, Dependencia, DocumentoObra, EconomiaObra, ObraPanel, PlanVsReal, Restriccion,
  ServiceResult, ServiceResultOpcional,
} from '../types'

/** El portafolio: una fila por obra, ordenado por el orden declarado y después por nombre. */
export async function getPortafolio(supabase: SupabaseClient): Promise<ServiceResult<ObraPanel[]>> {
  const { data, error } = await supabase
    .from('obra_panel')
    .select('*')
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as ObraPanel[], error: null }
}

export async function getObra(supabase: SupabaseClient, obraId: string): Promise<ServiceResultOpcional<ObraPanel>> {
  const { data, error } = await supabase.from('obra_panel').select('*').eq('obra_id', obraId).maybeSingle()
  if (error) return { data: null, error: error.message }
  // ═══ NO EXISTE NO ES UN ERROR ═══
  //
  // Devolvía `error: "No existe la obra X"`, y entonces la ficha entraba por la rama de fallo: una
  // obra borrada se dibujaba con la regla roja de una base caída, y el `notFound()` de la línea
  // siguiente era inalcanzable. Es el mismo defecto que ya costó horas al revés —un `grant` que
  // faltaba se veía como «página no encontrada»— con los dos hechos invertidos.
  //
  // La ausencia se devuelve como ausencia y decide quien pregunta: la ficha llama `notFound()`, y
  // el alta —que ya lo esperaba así, con un aviso que hasta hoy no se dibujaba nunca— ofrece
  // empezar una obra nueva.
  if (!data) return { data: null, error: null }
  return { data: data as ObraPanel, error: null }
}

/**
 * LA UBICACIÓN, leída de `obra_canonica` y no de `obra_panel`.
 *
 * La columna se agregó a la tabla y la vista nunca se rehizo, así que el panel no la trae. Se lee
 * suelta en vez de tocar la vista: una migración en el repositorio no es una migración aplicada, y
 * si la pantalla dependiera de una columna que en producción todavía no existe, la ficha entera
 * dejaría de abrir. Acá, en el peor caso, falta un campo.
 */
export async function getUbicacion(supabase: SupabaseClient, obraId: string): Promise<string | null> {
  const { data } = await supabase.from('obra_canonica').select('ubicacion').eq('id', obraId).maybeSingle()
  return (data?.ubicacion as string) ?? null
}

/**
 * PLAN CONTRA REAL de una obra. Sale entero de la vista `obra_plan_vs_real`: acá NO se resta, no se
 * divide y no se completa nada. Si el desvío viene en null es porque le falta una punta, y ese null
 * viaja hasta la pantalla — que dice cuál falta en vez de dibujar un cero tranquilizador.
 */
export async function getPlanVsReal(supabase: SupabaseClient, obraId: string): Promise<ServiceResult<PlanVsReal>> {
  const { data, error } = await supabase.from('obra_plan_vs_real').select('*').eq('obra_id', obraId).maybeSingle()
  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: `No hay plan contra real para "${obraId}"` }
  return { data: data as PlanVsReal, error: null }
}

/**
 * EL PANEL ECONÓMICO de una obra, entero de la vista `obra_economia`. Acá NO se resta ni se
 * completa: los márgenes ya vienen en null cuando falta la base, y la pantalla dice qué falta.
 *
 * Devuelve `null` sin error cuando la vista no publica fila: para quien no ve la economía, la venta
 * y el margen llegan en null desde Postgres y esta pantalla no tiene nada que dibujar.
 */
export async function getEconomiaObra(
  supabase: SupabaseClient, obraId: string,
): Promise<ServiceResult<EconomiaObra | null>> {
  const { data, error } = await supabase.from('obra_economia').select('*').eq('obra_id', obraId).maybeSingle()
  if (error) return { data: null, error: error.message }
  return { data: (data as EconomiaObra) ?? null, error: null }
}

/** El plan contra real de TODAS las obras: es lo que le da al portafolio sus columnas de plazo. */
export async function getPlanVsRealPortafolio(supabase: SupabaseClient): Promise<ServiceResult<PlanVsReal[]>> {
  const { data, error } = await supabase.from('obra_plan_vs_real').select('*')
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as PlanVsReal[], error: null }
}

/**
 * EL CRONOGRAMA, en el orden del tracker de origen.
 *
 * ═══ SIN `obraId` DEVUELVE EL DE TODAS LAS OBRAS, Y ES LA MISMA FUNCIÓN A PROPÓSITO ═══
 *
 * El dueño (19/08), textual: *"MISMA TABLA/FUENTE → vista global + filtro por obra"* · *"NO crear
 * dos sistemas"*. Una `getActividadesGlobal()` aparte sería la segunda definición del cronograma:
 * el día que una de las dos cambie un filtro —las archivadas, el orden, una columna— el Gantt de la
 * obra y el Gantt global mostrarían plan distinto del mismo trabajo, y no habría manera de saber
 * cuál miente. Acá el parámetro sólo AGREGA un `where`; todo lo demás es literalmente el mismo
 * camino.
 *
 * QUÉ OBRAS VUELVEN NO LO DECIDE ESTA CAPA: lo decide el RLS de `obra_actividad`
 * (`public.ve_obra(obra_id)`). Repetir acá el predicado de seguridad sería tenerlo escrito dos
 * veces, y la copia de TypeScript no protege la llamada directa a PostgREST.
 */
export async function getActividades(supabase: SupabaseClient, obraId?: string): Promise<ServiceResult<Actividad[]>> {
  // ═══ SE LEE LA VISTA, NO LA TABLA ═══
  //
  // `obra_actividad_control` es un superconjunto estricto de `obra_actividad`: las mismas columnas
  // más el avance calculado, la producción acumulada, las HH imputadas, los impedimentos abiertos y
  // el estado operativo. Leyendo la tabla, cada pantalla que necesitara uno de esos números tenía
  // que calcularlo por su cuenta — y ahí es donde el Gantt y el tablero empiezan a mostrar distinto
  // avance de la misma actividad. Hereda el RLS por `security_invoker`.
  const base = supabase.from('obra_actividad_control').select('*')
  const { data, error } = await (obraId ? base.eq('obra_id', obraId) : base)
    // El orden por obra es inocuo cuando hay una sola y es el que agrupa la vista global. Un solo
    // orden para los dos casos: dos órdenes son dos cronogramas.
    .order('obra_id', { ascending: true })
    .order('orden', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as Actividad[], error: null }
}

/** Las restricciones. Las abiertas primero y, dentro de ellas, la que vence antes. */
export async function getRestricciones(supabase: SupabaseClient, obraId?: string): Promise<ServiceResult<Restriccion[]>> {
  const base = supabase.from('obra_restriccion').select('*')
  const { data, error } = await (obraId ? base.eq('obra_id', obraId) : base)
    .order('estado', { ascending: true })
    .order('fecha_compromiso', { ascending: true, nullsFirst: false })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as Restriccion[], error: null }
}

/**
 * LAS PRECEDENCIAS del cronograma. Hoy la tabla está vacía en las cinco obras, y eso es lo que hay
 * que mostrar: el Gantt no dibuja una sola flecha hasta que alguien declare la primera. Deducirlas
 * de las fechas sería fabricar la estructura del plan.
 */
export async function getDependencias(supabase: SupabaseClient, obraId?: string): Promise<ServiceResult<Dependencia[]>> {
  const base = supabase.from('obra_dependencia').select('id, obra_id, origen_id, destino_id, tipo, lag_dias')
  const { data, error } = await (obraId ? base.eq('obra_id', obraId) : base)
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as Dependencia[], error: null }
}

/**
 * De qué obra es cada documento. NO va en `DocumentoObra` —el tipo compartido— porque la solapa de
 * la obra ya sabe de qué obra está mirando: la columna sólo existe en la lista global.
 */
export interface DocumentoConObra extends DocumentoObra {
  obra_id: string
}

/**
 * Los documentos de la obra: el vínculo vive en `obra_documento` y los metadatos en `drive_index`.
 * Se hacen dos consultas y se cruzan acá en vez de un join, porque `drive_index` se resincroniza
 * entero cada 4 horas y un archivo puede desaparecer de él sin que el vínculo deje de ser válido:
 * en ese caso se publica lo que se supo AL VINCULAR, en lugar de perder la fila entera en un
 * `inner join`.
 *
 * ═══ POR QUÉ EL SELECT ES `*` Y NO LA LISTA DE COLUMNAS ═══
 *
 * Nombrar `nombre, tipo, mime_type` haría que la solapa entera devuelva un error 400 en cualquier
 * base donde `20260819T0100_obra_documento` todavía no se aplicó — y una migración que está en el
 * repositorio NO es una migración aplicada. Con `*`, PostgREST devuelve las columnas que existan y
 * las que falten llegan como `undefined`, que es exactamente el caso que el mapeo de abajo ya
 * contempla. Mismo criterio que `getUbicacion`: en el peor caso falta un campo, no la pantalla.
 * Sobre una tabla de vínculo de nueve columnas, `*` no cuesta nada.
 */
export async function getDocumentos(
  supabase: SupabaseClient,
  obraId?: string,
): Promise<ServiceResult<DocumentoConObra[]>> {
  const base = supabase.from('obra_documento').select('*')
  const { data: vinculos, error } = await (obraId ? base.eq('obra_id', obraId) : base)
  if (error) return { data: null, error: error.message }
  const ids = (vinculos ?? []).map((v) => v.drive_file_id as string)
  if (!ids.length) return { data: [], error: null }

  const { data: archivos } = await supabase
    .from('drive_index')
    .select('drive_file_id, name, path, mime_type, is_folder, modified_time')
    .in('drive_file_id', ids)
  const porId = new Map((archivos ?? []).map((a) => [a.drive_file_id as string, a]))

  const docs: DocumentoConObra[] = (vinculos ?? []).map((v) => {
    const a = porId.get(v.drive_file_id as string)
    return {
      obra_id: v.obra_id as string,
      drive_file_id: v.drive_file_id as string,
      rol: (v.rol as string) ?? null,
      // `manual`/`path_inferido` es el vocabulario viejo de la tabla. Se traduce acá para que la
      // pantalla no muestre dos palabras distintas para lo mismo durante la ventana en la que la
      // migración está escrita pero no aplicada.
      origen: v.origen === 'inferido' || v.origen === 'path_inferido' ? 'inferido' : 'confirmado',
      // `drive_index` GANA: un archivo renombrado en Drive aparece con su nombre nuevo sin que nadie
      // toque el vínculo. Lo guardado al vincular es el respaldo para los archivos que el índice no
      // conoce — sólo espeja la carpeta `administracion`.
      tipo: a ? (a.is_folder ? 'carpeta' : 'archivo') : v.tipo === 'carpeta' ? 'carpeta' : 'archivo',
      name: (a?.name as string) ?? (v.nombre as string) ?? null,
      path: (a?.path as string) ?? null,
      mime_type: (a?.mime_type as string) ?? (v.mime_type as string) ?? null,
      modified_time: (a?.modified_time as string) ?? null,
      creado_en: (v.creado_en as string) ?? null,
      // PARA QUÉ ACTIVIDAD ES, cuando alguien lo declaró. `undefined` en una base donde la columna
      // todavía no existe: por eso el `??`, igual que el resto de los campos de esta tabla.
      actividad_id: (v.actividad_id as string) ?? null,
    }
  })
  return { data: docs, error: null }
}

/**
 * EL LOOKAHEAD: las actividades cuya ventana toca las próximas `semanas` semanas.
 *
 * Es una VISTA del cronograma, no una tabla nueva. El Last Planner completo —compromiso semanal
 * congelado, PPC y causa de incumplimiento— exige dos listas cerradas que el dueño todavía no fijó,
 * y una lista que se cambia después rompe toda la serie histórica del Pareto. Hasta entonces esto
 * es el make-ready: qué viene, y qué lo está frenando.
 */
export function lookahead(actividades: Actividad[], semanas = 6, hoy = new Date()): Actividad[] {
  const desde = new Date(hoy); desde.setUTCHours(0, 0, 0, 0)
  const hasta = new Date(desde.getTime() + semanas * 7 * 86400000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const d0 = iso(desde); const d1 = iso(hasta)
  return actividades.filter((a) => {
    if (a.tipo === 'resumen') return false
    const ini = a.inicio_plan; const fin = a.fin_plan ?? a.inicio_plan
    if (!ini) return false
    // Toca la ventana si empieza dentro, o si empezó antes y todavía no terminó.
    return (ini >= d0 && ini <= d1) || (ini < d0 && (fin ?? ini) >= d0)
  })
}
