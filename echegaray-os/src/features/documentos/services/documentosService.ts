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
  conVinculos, ventanaVencimientos,
  type ArchivoIndexado, type VinculoCliente, type VinculoLegajo,
} from './documentos'
import { esCategoria, patronesAnteriores, patronesDe, type ClaveCategoria, type Patron } from './categorias'

// `nombre_norm` viaja porque es el campo que CLASIFICA: la etiqueta de categoría de cada fila se
// calcula con el mismo texto contra el que filtró Postgres. Normalizar el nombre otra vez en el
// navegador dejaría al chip y a la fila discutiendo sobre el mismo archivo.
const COLUMNAS = 'drive_file_id, name, path, tipo, mime_type, size_bytes, modified_time, nombre_norm'

/** Tope de filas dibujadas. Cuando se alcanza, la pantalla dice «se listan N de M». */
export const TOPE = 200

export interface FiltroDocumentos {
  q?: string
  /** Prefijo de ruta: una carpeta del catálogo, no una categoría inventada. */
  carpeta?: string
  tipo?: string
  /** Una clave de `categorias.ts`. Se traduce a patrones SQL, no a una columna que no existe. */
  categoria?: string
  /** `vencido` o `mes`: el recorte de la banda de alertas, aplicado a la tabla. */
  vence?: string
  /** El día contra el que se mide `vence`, en ISO. Lo fija la pantalla una sola vez. */
  hoy?: string
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

export async function getDocumentos(
  supabase: SupabaseClient,
  filtro: FiltroDocumentos = {},
): Promise<ServiceResult<Catalogo>> {
  // EL RECORTE POR VENCIMIENTO SE RESUELVE ANTES: los vencimientos viven en `documentacion_legajo` y
  // el catálogo en `drive_index`. Se piden los ids de la ventana y se acota con ellos.
  let ids: string[] | null = null
  if (filtro.vence) {
    const r = await idsPorVencer(supabase, filtro.vence, filtro.hoy ?? new Date().toISOString().slice(0, 10))
    if (r.error) return { data: null, error: r.error }
    ids = r.data ?? []
    // CERO IDS ES CERO DOCUMENTOS, no «traé todo». Un `.in()` con la lista vacía es la clase de
    // filtro que se cae hacia el lado abierto y muestra 3.123 archivos donde no había ninguno.
    if (ids.length === 0) return { data: { documentos: [], total: 0 }, error: null }
  }

  let consulta = supabase
    .from('drive_index')
    .select(COLUMNAS, { count: 'exact' })
    .eq('is_folder', false)
  if (ids) consulta = consulta.in('drive_file_id', ids)
  if (esCategoria(filtro.categoria)) consulta = conCategoria(consulta, filtro.categoria)

  const q = filtro.q?.trim()
  if (q) {
    const seguro = q.replace(/[,()*]/g, ' ').trim()
    if (seguro) consulta = consulta.or(`name.ilike.%${seguro}%,path.ilike.%${seguro}%`)
  }
  // `carpeta` viene de la lista de carpetas reales del índice, pero llega por la URL: se escapa
  // igual que la búsqueda. Un `%` puesto a mano acá convertiría el filtro en «traé todo».
  const carpeta = filtro.carpeta?.trim().replace(/[,()*%]/g, '')
  if (carpeta) consulta = consulta.like('path', `${carpeta}/%`)
  if (filtro.tipo?.trim()) consulta = consulta.eq('tipo', filtro.tipo.trim())

  const { data, error, count } = await consulta
    .order('modified_time', { ascending: false, nullsFirst: false })
    .limit(TOPE)
  if (error) return { data: null, error: error.message }

  const archivos = (data ?? []) as ArchivoIndexado[]
  const vinculos = await leerVinculos(supabase, archivos.map((a) => a.drive_file_id))
  return {
    data: { documentos: conVinculos(archivos, vinculos.legajos, vinculos.clientes), total: count ?? archivos.length },
    error: null,
  }
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
): Promise<{ legajos: VinculoLegajo[]; clientes: VinculoCliente[] }> {
  if (ids.length === 0) return { legajos: [], clientes: [] }
  const [legajo, cliente] = await Promise.all([
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
  ])
  return {
    legajos: (legajo.data ?? []) as unknown as VinculoLegajo[],
    clientes: (cliente.data ?? []) as unknown as VinculoCliente[],
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
  return { data: conVinculos([archivo], vinculos.legajos, vinculos.clientes)[0], error: null }
}
