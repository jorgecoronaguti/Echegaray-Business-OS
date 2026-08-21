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
import type { CarpetaRaiz, Documento } from '../types'
import {
  conVinculos, type ArchivoIndexado, type VinculoCliente, type VinculoLegajo,
} from './documentos'

const COLUMNAS = 'drive_file_id, name, path, tipo, mime_type, size_bytes, modified_time'

/** Tope de filas dibujadas. Cuando se alcanza, la pantalla dice «se listan N de M». */
export const TOPE = 200

export interface FiltroDocumentos {
  q?: string
  /** Prefijo de ruta: una carpeta del catálogo, no una categoría inventada. */
  carpeta?: string
  tipo?: string
}

export interface Catalogo {
  documentos: Documento[]
  /** Cuántos hay en total con este filtro. Es lo que deja decir «se listan 200 de 1.147». */
  total: number
}

export async function getDocumentos(
  supabase: SupabaseClient,
  filtro: FiltroDocumentos = {},
): Promise<ServiceResult<Catalogo>> {
  let consulta = supabase
    .from('drive_index')
    .select(COLUMNAS, { count: 'exact' })
    .eq('is_folder', false)

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
      .select('drive_file_id, tipo_documento, fecha_vencimiento, persona_id, personas(nombre_completo)')
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
