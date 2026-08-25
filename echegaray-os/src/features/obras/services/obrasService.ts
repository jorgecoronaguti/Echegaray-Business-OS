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

import type { JuegoDeColumnasDelPlan } from './lecturasDeVista'
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
 * LOS DÍAS QUE ESTA OBRA TRABAJA (`isodow`: 1 lunes … 7 domingo), leídos de `obra_canonica`.
 *
 * El cronograma sombrea los días que NO están en esta lista. Vacío NO se completa con lunes a
 * viernes: una obra que trabaja los sábados vería pintado de franco el día en que su cuadrilla
 * estuvo en obra, y el ancho de una barra es calendario —los días hábiles ya los resolvió el
 * motor—, así que la sombra es lo único que distingue diez días de trabajo de diez días corridos.
 */
export async function getDiasHabiles(supabase: SupabaseClient, obraId: string): Promise<number[]> {
  const { data } = await supabase.from('obra_canonica').select('dias_habiles').eq('id', obraId).maybeSingle()
  const d = data?.dias_habiles
  return Array.isArray(d) ? (d as number[]).filter((n) => typeof n === 'number') : []
}

/** LAS COLUMNAS DE `obra_plan_vs_real` QUE DIBUJA CADA SOLAPA, y su tipo.
 *
 *  ═══ POR QUÉ HAY TRES LECTURAS Y NO UNA CON `select('*')` (25/08/2026) ═══
 *
 *  Mismo motivo y misma forma que `COLUMNAS_PLAZO_Y_HH` acá abajo, pero por una razón más dura: la
 *  solapa Personal y el Resumen se caían con `canceling statement due to statement timeout`, y el
 *  techo no es negociable —el rol `authenticated` corre con `statement_timeout = 8s`—. Medido con
 *  EXPLAIN (ANALYZE, BUFFERS) como Dirección sobre `quattropani`, mediana de 5:
 *
 *    select *                        9.413 buffers · 29,7 ms
 *    las 4 columnas de Personal      4.572 buffers · 15,5 ms   −51 %
 *    las 8 columnas de Economía      4.577 buffers · 16,4 ms   −51 %
 *
 *  La causa de que recortar columnas valga la mitad —y de por qué el Resumen no ahorra nada— está
 *  en `lecturasDeVista.ts`, al lado de la matriz que decide quién pide qué.
 *
 *  SON TRES FUNCIONES Y NO UNA CON UN PARÁMETRO porque el tipo tiene que ser exacto: un objeto con
 *  treinta campos ausentes se lee `undefined`, y en pantalla eso es indistinguible de un dato que
 *  falta de verdad. Con un `Pick<>` por solapa, la primera columna que alguien dibuje sin haberla
 *  pedido no compila — que es exactamente lo que tiene que pasar. */
export type PlanDePersonal = Pick<PlanVsReal, 'obra_id' | 'hh_plan' | 'hh_real' | 'desvio_hh_pct'>

export type PlanDeEconomia = Pick<
  PlanVsReal,
  'obra_id' | 'monto_presupuestado' | 'margen_esperado' | 'certificado' | 'facturado' | 'cobrado'
  | 'pendiente_certificar' | 'por_cobrar_proyectado'
>

/** Una sola definición de cada juego, para la consulta y para su test. */
export const COLUMNAS_PLAN: Record<JuegoDeColumnasDelPlan, string> = {
  // El Resumen pide la vista entera A PROPÓSITO: recortarla a las diecinueve columnas que dibuja
  // se midió y da lo mismo (9.405 contra 9.413 buffers), porque `forecast_fin` —una sola columna—
  // arrastra el bloque de fechas completo. Dejarlo en `*` es honesto: no hay ahorro que declarar.
  resumen: '*',
  personal: 'obra_id,hh_plan,hh_real,desvio_hh_pct',
  economia: 'obra_id,monto_presupuestado,margen_esperado,certificado,facturado,cobrado,'
    + 'pendiente_certificar,por_cobrar_proyectado',
}

async function leerPlan<T>(
  supabase: SupabaseClient, obraId: string, juego: JuegoDeColumnasDelPlan,
): Promise<ServiceResult<T>> {
  const { data, error } = await supabase
    .from('obra_plan_vs_real').select(COLUMNAS_PLAN[juego]).eq('obra_id', obraId).maybeSingle()
  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: `No hay plan contra real para "${obraId}"` }
  return { data: data as T, error: null }
}

/**
 * PLAN CONTRA REAL de una obra, entero. Sale de la vista `obra_plan_vs_real`: acá NO se resta, no
 * se divide y no se completa nada. Si el desvío viene en null es porque le falta una punta, y ese
 * null viaja hasta la pantalla — que dice cuál falta en vez de dibujar un cero tranquilizador.
 */
export function getPlanVsReal(
  supabase: SupabaseClient, obraId: string,
): Promise<ServiceResult<PlanVsReal>> {
  return leerPlan<PlanVsReal>(supabase, obraId, 'resumen')
}

/** Las HH del titular de Personal, y nada más. Cuatro columnas: ver el bloque de arriba. */
export function getPlanDePersonal(
  supabase: SupabaseClient, obraId: string,
): Promise<ServiceResult<PlanDePersonal>> {
  return leerPlan<PlanDePersonal>(supabase, obraId, 'personal')
}

/** Presupuesto, margen, certificación y cobranza de la solapa Economía. Ocho columnas. */
export function getPlanDeEconomia(
  supabase: SupabaseClient, obraId: string,
): Promise<ServiceResult<PlanDeEconomia>> {
  return leerPlan<PlanDeEconomia>(supabase, obraId, 'economia')
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

/** Las SIETE columnas que la cartera dibuja de `obra_plan_vs_real`, y ninguna más.
 *
 *  El tipo es un `Pick` y no una interfaz nueva a propósito: la fuente de la forma sigue siendo
 *  `PlanVsReal`: si mañana `desvio_plazo_dias` cambia de tipo, esto cambia solo. */
export type PlazoYHHDeCartera = Pick<
  PlanVsReal,
  'obra_id' | 'inicio_plan' | 'fin_plan' | 'desvio_plazo_dias' | 'hh_plan' | 'hh_estimada' | 'hh_real'
>

/** Las columnas pedidas, en el orden del tipo. Una sola definición para la consulta y para el test. */
export const COLUMNAS_PLAZO_Y_HH =
  'obra_id,inicio_plan,fin_plan,desvio_plazo_dias,hh_plan,hh_estimada,hh_real'

/** El plan contra real de TODAS las obras: es lo que le da al portafolio sus columnas de plazo.
 *
 *  ═══ POR QUÉ NO ES `select('*')` (24/08/2026) ═══
 *
 *  Pedía las ~40 columnas de la vista y la cartera dibuja siete. Medido contra PostgREST con sesión
 *  de Dirección, nueve vueltas intercaladas para no confundir la mejora con la deriva de una base
 *  contendida:
 *
 *    select=*      → mediana 320 ms · p90 607 ms · 16,6 KB
 *    siete columnas→ mediana 257 ms · p90 315 ms ·  2,5 KB
 *
 *  Las columnas que se dejan de pedir no son gratis: `pendiente_certificar` llama a
 *  `es_administracion()` por fila, y el bloque económico arrastra `presupuesto_monto()` y
 *  `presupuesto_margen()`. La cartera nunca los dibujó.
 *
 *  NO SE DEVUELVE UN `PlanVsReal` INCOMPLETO. Un objeto con 33 campos ausentes se lee `undefined`
 *  —no `null`— y la primera columna nueva que alguien agregue a la tabla se dibujaría vacía sin un
 *  solo error. El tipo dice exactamente lo que la consulta trae. */
export async function getPlanVsRealPortafolio(
  supabase: SupabaseClient,
): Promise<ServiceResult<PlazoYHHDeCartera[]>> {
  const { data, error } = await supabase.from('obra_plan_vs_real').select(COLUMNAS_PLAZO_Y_HH)
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as PlazoYHHDeCartera[], error: null }
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
      //
      // `carpeta_drive` (20260822T6500) NO se colapsa en `confirmado`: el vínculo salió de que el
      // archivo vive adentro de la carpeta que declara la obra —evidencia dura— pero ninguna persona
      // lo afirmó. Mezclarlos haría que los 32 papeles que entran por barrido se lean como revisados.
      origen: v.origen === 'carpeta_drive'
        ? 'carpeta_drive'
        : v.origen === 'inferido' || v.origen === 'path_inferido' ? 'inferido' : 'confirmado',
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
