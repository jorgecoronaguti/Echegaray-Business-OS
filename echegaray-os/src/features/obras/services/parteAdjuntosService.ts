// LEER LOS ADJUNTOS DEL PARTE — con el cliente del usuario, o sea pasando por RLS.
//
// Dos lectores: `getAdjuntosDeParte` trae las filas de un rango de días (la solapa Documentos lista
// «Registro fotográfico» por día; la 06 pide un solo día) y `firmarAdjuntos` les pone la URL firmada
// de corta vida con la que la pantalla dibuja la miniatura. Se separan porque firmar cuesta un viaje
// a Storage por lote y sólo hace falta para lo que se va a mostrar ahora.
//
// LA FIRMA NO ES LA CERRADURA: el bucket es privado y `createSignedUrls` con el cliente del usuario
// sólo firma lo que la policy de Storage le deja leer (`ve_obra` sobre la 2ª carpeta).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '../types/index.ts'
import { ordenarAdjuntos, type AdjuntoDeParte } from './parteAdjuntos.ts'

export const BUCKET_ADJUNTOS = 'partes-adjuntos'
/** Diez minutos: alcanza para mirar el parte y no para dejar un enlace vivo en un chat. */
export const VIGENCIA_FIRMA = 600

const COLUMNAS = 'id, obra_id, fecha, actividad_id, ejecucion_id, storage_path, nombre_archivo, tipo_mime, tamano_bytes, descripcion, tomada_en, subido_por, creado_en, borrado_en'

/**
 * Los adjuntos VIGENTES de una obra entre dos días (inclusive), ordenados por momento. `hasta`
 * ausente = hasta hoy. Tope de 600 filas: son 20 días de 30 fotos; Documentos pagina por rango.
 */
export async function getAdjuntosDeParte(
  supabase: SupabaseClient, obraId: string, rango: { desde: string; hasta?: string },
): Promise<ServiceResult<AdjuntoDeParte[]>> {
  let q = supabase.from('obra_parte_adjunto').select(COLUMNAS)
    .eq('obra_id', obraId).is('borrado_en', null).gte('fecha', rango.desde)
  if (rango.hasta) q = q.lte('fecha', rango.hasta)
  const { data, error } = await q.order('fecha', { ascending: false }).order('creado_en', { ascending: true }).limit(600)
  if (error) return { data: null, error: error.message }
  return { data: ordenarAdjuntos((data ?? []) as AdjuntoDeParte[]), error: null }
}

export interface AdjuntoFirmado extends AdjuntoDeParte {
  /** La URL firmada para mostrar o abrir el archivo. `null` = no se pudo firmar; la pantalla lo dice, no dibuja una miniatura rota. */
  url: string | null
}

/** Les pone la URL firmada. Un fallo de firma no voltea la lista: esa fila queda con `url: null`. */
export async function firmarAdjuntos(supabase: SupabaseClient, filas: readonly AdjuntoDeParte[]): Promise<AdjuntoFirmado[]> {
  if (!filas.length) return []
  const { data, error } = await supabase.storage.from(BUCKET_ADJUNTOS)
    .createSignedUrls(filas.map((f) => f.storage_path), VIGENCIA_FIRMA)
  const porRuta = new Map<string, string>()
  if (!error) for (const d of data ?? []) if (d.path && d.signedUrl) porRuta.set(d.path, d.signedUrl)
  return filas.map((f) => ({ ...f, url: porRuta.get(f.storage_path) ?? null }))
}
