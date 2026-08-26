// DOCUMENTOS — la lectura del catálogo de Drive y de sus vínculos.
//
// ═══ POR QUÉ `drive_index` Y NO OTRA ═══
//
// Medido el 21/08/2026 contra la base real: `obra_documento` 0 filas · `documento_presentacion` 0 ·
// `drive_documento_estado` 0 · `drive_index` 3.593 (3.123 archivos) · `documentacion_legajo` 847 ·
// `cliente_documento` 214. La vista transversal sale de la única tabla que tiene el archivo; las
// otras dos que tienen filas no son catálogos sino VÍNCULOS, y entran como columna.
//
// ═══ EL FILTRO SE HACE EN POSTGRES, NO EN EL NAVEGADOR ═══
//
// 3.123 archivos con su ruta son ~300 kB por apertura. La búsqueda va como `ilike` sobre `name` y
// `path` —el mismo patrón que `getProveedores`— y el resultado se acota con un tope explícito que
// la pantalla dice en voz alta. No se usa el motor de tokens de `drive-busqueda`: ese resuelve
// lenguaje natural del chat (sinónimos, singulares, ranking aprendido) y acá el usuario está
// filtrando una tabla que ve, donde «empieza con lo que tipeo» es lo que espera.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '@/features/administracion/types'
import type { CarpetaRaiz, Documento, ResumenVencimientos } from '../types'
import {
  conVinculos, partirIds, unirPartes, ventanaVencimientos,
  type ArchivoIndexado, type VinculoCliente, type VinculoLegajo, type VinculoObra,
} from './documentos'
import { esCategoria, patronesAnteriores, patronesDe, type ClaveCategoria, type Patron } from './categorias'

// `nombre_norm` viaja porque es el campo que CLASIFICA: la etiqueta de categoría de cada fila se
// calcula con el mismo texto contra el que filtró Postgres. Normalizar el nombre otra vez en el
// navegador dejaría al chip y a la fila discutiendo sobre el mismo archivo.
const COLUMNAS = 'drive_file_id, name, path, tipo, mime_type, size_bytes, modified_time, nombre_norm'

/**
 * Filas por página. La pantalla pide una más con «Cargar más» y la consulta trae `TOPE × páginas`.
 *
 * 100 y no 200: el tope existe para que 3.599 archivos no se dibujen de una, y 200 filas ya son dos
 * pantallas y media de barrido. Con «Cargar más» el tope dejó de ser un techo —era eso, un techo sin
 * puerta: lo que caía en la fila 201 no se alcanzaba desde ningún lado— y pasó a ser el tamaño del
 * primer bocado.
 */
export const TOPE = 100

/** Tope duro de páginas. 30 páginas son 3.000 filas: más que eso no es una lista, es un volcado —y
 *  sin él, `?n=99999` es una consulta de 3.599 filas con sus vínculos que cualquiera puede pedir. */
export const PAGINAS_MAX = 30

/** Las clases de vínculo por las que se puede filtrar. NO incluye proveedor: no existe la tabla. */
export const ENTIDADES = ['obra', 'persona', 'cliente'] as const
export type Entidad = (typeof ENTIDADES)[number]
export const esEntidad = (v: string | undefined): v is Entidad =>
  !!v && (ENTIDADES as readonly string[]).includes(v)

export interface FiltroDocumentos {
  q?: string
  /** Prefijo de ruta: una carpeta del catálogo, no una categoría inventada. */
  carpeta?: string
  tipo?: string
  /** Una clave de `categorias.ts`. Se traduce a patrones SQL, no a una columna que no existe. */
  categoria?: string
  /** `vencido` o `mes`: el recorte de la banda de alertas, aplicado a la tabla. */
  vence?: string
  /** De quién cuelga el archivo: `obra`, `persona` o `cliente`. Se resuelve en Postgres contra la
   *  tabla de vínculo, nunca descartando filas ya traídas en el navegador. */
  entidad?: string
  /** El día contra el que se mide `vence`, en ISO. Lo fija la pantalla una sola vez. */
  hoy?: string
  /** Cuántas páginas de `TOPE` filas pedir. 1 por defecto; lo sube «Cargar más». */
  paginas?: number
}

export interface Catalogo {
  documentos: Documento[]
  /** Cuántos hay en total con este filtro. Es lo que deja decir «se listan 200 de 1.147». */
  total: number
}

/**
 * Un patrón dentro de `or=(…)` de PostgREST. LAS COMILLAS NO SON DECORATIVAS: sin ellas el punto de
 * `%.dwg` separa columna de operador y la consulta entera falla. Ningún patrón contiene `"`.
 */
const comoOr = (p: Patron) => `${p.campo}.ilike."${p.patron}"`

/**
 * EL FILTRO DE CATEGORÍA, TRADUCIDO A POSTGRES.
 *
 * Dos mitades, y la segunda es la que hace que el chip y la etiqueta de la fila digan lo mismo:
 * los patrones PROPIOS de la categoría, y la negación de los de TODA categoría anterior. Sin la
 * negación, «Certificado Afiliacion - ART.pdf» entraría por el chip `certificados` aunque su fila
 * diga `Seguros`, y quien filtre no podría confiar en lo que ve. `otros` es sólo negación.
 */
function conCategoria<T extends { or: (f: string) => T; not: (c: string, o: string, v: string) => T }>(
  consulta: T,
  clave: ClaveCategoria,
): T {
  const propios = patronesDe(clave)
  let c = propios.length > 0 ? consulta.or(propios.map(comoOr).join(',')) : consulta
  for (const p of patronesAnteriores(clave)) c = c.not(p.campo, 'ilike', p.patron)
  return c
}

/**
 * Un constructor de consulta sobre `drive_index`, visto por lo único que esta función necesita.
 *
 * NO se usa el tipo real de PostgREST a propósito: encadenar dos ayudantes genéricos sobre él
 * (`conCategoria` y los filtros de acá) hace que TypeScript instancie el tipo hasta el fondo y
 * falle con «type instantiation is excessively deep». Comprobado — no es una precaución teórica.
 */
interface Consulta {
  or: (f: string) => Consulta
  not: (c: string, o: string, v: string) => Consulta
  like: (c: string, p: string) => Consulta
  eq: (c: string, v: unknown) => Consulta
}

/**
 * Los filtros que se expresan como columnas de `drive_index`. Se aplican IGUAL a cada parte cuando
 * la consulta se parte: si una parte filtrara distinto, la unión mezclaría dos búsquedas.
 */
function conFiltros(consulta: Consulta, filtro: FiltroDocumentos): Consulta {
  let c = consulta
  if (esCategoria(filtro.categoria)) c = conCategoria(c, filtro.categoria)

  const q = filtro.q?.trim()
  if (q) {
    const seguro = q.replace(/[,()*]/g, ' ').trim()
    if (seguro) c = c.or(`name.ilike.%${seguro}%,path.ilike.%${seguro}%`)
  }
  // `carpeta` viene de la lista de carpetas reales del índice, pero llega por la URL: se escapa
  // igual que la búsqueda. Un `%` puesto a mano acá convertiría el filtro en «traé todo».
  const carpeta = filtro.carpeta?.trim().replace(/[,()*%]/g, '')
  if (carpeta) c = c.like('path', `${carpeta}/%`)
  if (filtro.tipo?.trim()) c = c.eq('tipo', filtro.tipo.trim())
  return c
}

/** Lo que hace falta para cerrar la consulta después de filtrarla. */
interface ConsultaOrdenable extends Consulta {
  order: (c: string, o: { ascending: boolean; nullsFirst: boolean }) => ConsultaOrdenable
  limit: (n: number) => ConsultaOrdenable
  in: (c: string, v: string[]) => PromiseLike<RespuestaLista>
  then: PromiseLike<RespuestaLista>['then']
}

type RespuestaLista = {
  data: unknown[] | null
  error: { message: string } | null
  count: number | null
}

export async function getDocumentos(
  supabase: SupabaseClient,
  filtro: FiltroDocumentos = {},
): Promise<ServiceResult<Catalogo>> {
  // ═══ LOS DOS RECORTES QUE NO SON COLUMNAS DE `drive_index` ═══
  //
  // El vencimiento vive en `documentacion_legajo` y el vínculo en tres tablas más. Los dos se
  // resuelven ANTES, a lista de ids, y se INTERSECAN: pedir «vencidos» y «de personas» a la vez
  // tiene que devolver los que cumplen las dos cosas, no la suma.
  const listas: string[][] = []
  if (filtro.vence) {
    const r = await idsPorVencer(supabase, filtro.vence, filtro.hoy ?? new Date().toISOString().slice(0, 10))
    if (r.error) return { data: null, error: r.error }
    listas.push(r.data ?? [])
  }
  if (esEntidad(filtro.entidad)) {
    const r = await idsDeEntidad(supabase, filtro.entidad)
    if (r.error) return { data: null, error: r.error }
    listas.push(r.data ?? [])
  }

  let ids: string[] | null = null
  if (listas.length > 0) {
    ids = listas.reduce((a, b) => { const s = new Set(b); return a.filter((x) => s.has(x)) })
    // CERO IDS ES CERO DOCUMENTOS, no «traé todo». Un `.in()` con la lista vacía es la clase de
    // filtro que se cae hacia el lado abierto y muestra 3.123 archivos donde no había ninguno.
    if (ids.length === 0) return { data: { documentos: [], total: 0 }, error: null }
  }

  const tope = TOPE * Math.min(Math.max(1, Math.trunc(filtro.paginas ?? 1)), PAGINAS_MAX)
  const base = (): ConsultaOrdenable => (conFiltros(
    supabase.from('drive_index').select(COLUMNAS, { count: 'exact' }).eq('is_folder', false) as unknown as Consulta,
    filtro,
  ) as ConsultaOrdenable).order('modified_time', { ascending: false, nullsFirst: false }).limit(tope)

  // Sin recorte por ids es UNA consulta. Con recorte son tantas como partes: ver `partirIds`, que
  // explica por qué un `.in()` de 847 ids no filtra mal sino que devuelve 400.
  const respuestas: RespuestaLista[] = ids === null
    ? [await base()]
    : await Promise.all(partirIds(ids).map((parte) => base().in('drive_file_id', parte)))

  const fallo = respuestas.find((r) => r.error)
  if (fallo?.error) return { data: null, error: fallo.error.message }

  const archivos = unirPartes(
    respuestas.map((r) => (r.data ?? []) as ArchivoIndexado[]),
    tope,
  )
  // Las partes no comparten ningún id, así que los `count` son disjuntos y su suma es el total real.
  const total = respuestas.reduce((s, r) => s + (r.count ?? 0), 0)

  const vinculos = await leerVinculos(supabase, archivos.map((a) => a.drive_file_id))
  return {
    data: {
      documentos: conVinculos(archivos, vinculos.legajos, vinculos.clientes, vinculos.obras),
      total,
    },
    error: null,
  }
}

// EL CONTADOR POR CHIP SE FUE CON EL PORTE 27 v2 (25/08/2026). `getConteoEntidades` traía los ids
// de las TRES tablas de vínculo —1.093 filas— en cada carga para poner un número al lado de cada
// pastilla; el v2 no los dibuja, y el único conteo que quedó es `n/total`, que sale de la consulta
// que la lista ya hace. Tres lecturas menos por página vista, y ningún dato menos en pantalla.

/** Los archivos vinculados a una clase de entidad. Es lo que hace que «De obras» filtre en Postgres
 *  y no descartando filas ya traídas: sin esto, filtrar por obra sobre las 100 primeras dejaría
 *  fuera las 32 de `obra_documento` casi siempre. */
async function idsDeEntidad(supabase: SupabaseClient, entidad: Entidad): Promise<ServiceResult<string[]>> {
  const tabla = { persona: 'documentacion_legajo', cliente: 'cliente_documento', obra: 'obra_documento' }[entidad]
  const { data, error } = await supabase.from(tabla).select('drive_file_id').not('drive_file_id', 'is', null)
  if (error) return { data: null, error: error.message }
  const ids = (data ?? []).map((f) => (f as { drive_file_id: string }).drive_file_id)
  return { data: [...new Set(ids)], error: null }
}

/**
 * Los vínculos SÓLO de los archivos que se van a dibujar.
 *
 * Un error de permisos acá no vacía la pantalla: el archivo existe igual y su ruta sigue diciendo
 * dónde está. Se devuelve la lista vacía y la columna dirá «sin vincular», que es exactamente lo
 * que ve alguien que no tiene permiso para saberlo.
 */
async function leerVinculos(
  supabase: SupabaseClient,
  ids: string[],
): Promise<{ legajos: VinculoLegajo[]; clientes: VinculoCliente[]; obras: VinculoObra[] }> {
  if (ids.length === 0) return { legajos: [], clientes: [], obras: [] }
  const [legajo, cliente, obra] = await Promise.all([
    supabase
      .from('documentacion_legajo')
      // `id` viaja porque es lo que la acción de fijar el vencimiento necesita para saber QUÉ fila
      // escribe. Sin él, el panel tendría que buscarla por (persona, tipo) y elegir una de varias.
      .select('id, drive_file_id, tipo_documento, fecha_vencimiento, persona_id, personas(nombre_completo)')
      .in('drive_file_id', ids),
    supabase
      .from('cliente_documento')
      .select('drive_file_id, rol, clientes(nombre_comercial, slug)')
      .in('drive_file_id', ids),
    // `obra_canonica.id` ES el identificador de la URL de la obra: no hay columna `slug`.
    supabase
      .from('obra_documento')
      .select('drive_file_id, rol, obra_canonica(id, nombre)')
      .in('drive_file_id', ids),
  ])
  return {
    legajos: (legajo.data ?? []) as unknown as VinculoLegajo[],
    clientes: (cliente.data ?? []) as unknown as VinculoCliente[],
    obras: (obra.data ?? []) as unknown as VinculoObra[],
  }
}

// ═══ VENCIMIENTOS ══════════════════════════════════════════════════════════════════════════════
//
// `documentacion_legajo.fecha_vencimiento` es HOY la única fecha de vigencia que existe en el OS:
// `cliente_documento` no tiene la columna (cliente_id, drive_file_id, rol, origen, creado_en y nada
// más). Así que la banda mide sobre 847 filas posibles, no sobre los 3.123 archivos, y lo dice.

/**
 * CUÁNTOS VENCIERON Y CUÁNTOS VENCEN ESTE MES — sobre la base entera, no sobre la página.
 *
 * Tres `count` con `head: true`: no bajan una sola fila, sólo el número. Un aviso de vencimientos
 * que se calculara sobre las 200 filas dibujadas diría «0 vencidos» cuando el vencido está en la
 * fila 340, que es exactamente el caso en el que hace falta el aviso.
 *
 * `conFecha` en 0 NO se dibuja como «está todo en orden»: son dos hechos opuestos y la pantalla los
 * separa. Hoy `conFecha` es 0 en las 847 filas — nadie cargó ninguna fecha todavía.
 */
export async function getResumenVencimientos(
  supabase: SupabaseClient,
  hoy: string,
): Promise<ServiceResult<ResumenVencimientos>> {
  const { desde, hasta } = ventanaVencimientos(hoy)
  const base = () => supabase
    .from('documentacion_legajo')
    .select('id', { count: 'exact', head: true })
    .not('fecha_vencimiento', 'is', null)

  const [conFecha, vencidos, mes] = await Promise.all([
    base(),
    base().lt('fecha_vencimiento', desde),
    base().gte('fecha_vencimiento', desde).lte('fecha_vencimiento', hasta),
  ])
  const fallo = conFecha.error ?? vencidos.error ?? mes.error
  if (fallo) return { data: null, error: fallo.message }
  return {
    data: { conFecha: conFecha.count ?? 0, vencidos: vencidos.count ?? 0, venceEsteMes: mes.count ?? 0 },
    error: null,
  }
}

/** Los archivos de Drive que caen en la ventana pedida. Es lo que convierte la banda en un filtro. */
async function idsPorVencer(
  supabase: SupabaseClient,
  ventana: string,
  hoy: string,
): Promise<ServiceResult<string[]>> {
  const { desde, hasta } = ventanaVencimientos(hoy)
  let consulta = supabase
    .from('documentacion_legajo')
    .select('drive_file_id')
    .not('drive_file_id', 'is', null)
  consulta = ventana === 'vencido'
    ? consulta.lt('fecha_vencimiento', desde)
    : consulta.gte('fecha_vencimiento', desde).lte('fecha_vencimiento', hasta)

  const { data, error } = await consulta
  if (error) return { data: null, error: error.message }
  const ids = (data ?? []).map((f) => (f as { drive_file_id: string }).drive_file_id)
  // Un mismo PDF puede estar en el legajo de dos personas: sin deduplicar, el `.in()` lo pediría
  // dos veces y el `count` de la tabla contaría de más.
  return { data: [...new Set(ids)], error: null }
}

/**
 * LAS CARPETAS RAÍZ, LEÍDAS DEL ÍNDICE.
 *
 * `depth = 0` son las tres raíces reales que el indexador escribe (`administracion`,
 * `archivo-fiscal`, `libro-sueldos`). No hay una taxonomía escrita a mano en el código: si mañana
 * el indexador suma una raíz, el filtro la ofrece sin tocar esta pantalla.
 */
export async function getCarpetasRaiz(supabase: SupabaseClient): Promise<ServiceResult<CarpetaRaiz[]>> {
  const { data, error } = await supabase
    .from('drive_index')
    .select('path, name')
    .eq('is_folder', true)
    .eq('depth', 0)
    .order('path', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as CarpetaRaiz[], error: null }
}

/** Un documento por su id de Drive, para el panel de detalle. */
export async function getDocumento(
  supabase: SupabaseClient,
  driveFileId: string,
): Promise<ServiceResult<Documento | null>> {
  const { data, error } = await supabase
    .from('drive_index')
    .select(COLUMNAS)
    .eq('drive_file_id', driveFileId)
    .maybeSingle()
  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: null }
  const archivo = data as ArchivoIndexado
  const vinculos = await leerVinculos(supabase, [archivo.drive_file_id])
  return { data: conVinculos([archivo], vinculos.legajos, vinculos.clientes, vinculos.obras)[0], error: null }
}
