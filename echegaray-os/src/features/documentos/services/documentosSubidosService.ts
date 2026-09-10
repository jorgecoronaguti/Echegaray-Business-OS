// LOS PAPELES QUE SE SUBIERON DESDE LA FICHA — la lectura, con su firma para abrirlos.
//
// ═══ URL FIRMADA, NO BUCKET PÚBLICO ═══
//
// Un contrato, un certificado o el DNI de alguien no pueden quedar accesibles a quien adivine la
// ruta. Los cuatro buckets son privados y la firma dura diez minutos: alcanza para abrir el papel y
// no para dejar un enlace vivo en un chat. La firma NO es la cerradura —la RLS de Storage lo es—,
// es la forma de servir lo que la RLS ya autorizó.
//
// ═══ LA TABLA PUEDE NO EXISTIR TODAVÍA ═══
//
// `entidad_documento` llega en una migración que aplica el dueño. Mientras no esté, PostgREST
// contesta 42P01 y la lectura devuelve `pendienteDeMigracion` en vez de reventar cuatro fichas. Es
// lo contrario de lo que hizo el H1 con `/documentos` —donde romper era correcto porque la pantalla
// ENTERA es el catálogo— y por la misma razón: acá el bloque es una parte de una ficha que tiene que
// seguir sirviendo para todo lo demás. Lo que no se hace es callarlo: se dibuja el aviso.

import type { SupabaseClient } from '@supabase/supabase-js'
import { BUCKET_POR_TIPO, type Categoria, type TipoEntidad } from './subidaDeDocumento'

/** Diez minutos. El mismo que ya usan los papeles del proveedor. */
const VIGENCIA = 600

export interface DocumentoSubido {
  id: string
  nombre_archivo: string
  tipo_mime: string
  tamano_bytes: number
  categoria: Categoria
  descripcion: string | null
  creado_en: string
  drive_estado: 'pendiente' | 'copiado' | 'error' | 'sin_carpeta'
  drive_file_id: string | null
  /** La URL firmada para abrirlo. `null` = no se pudo firmar, y NO es «no existe el archivo». */
  url: string | null
}

export interface Subidos {
  filas: DocumentoSubido[]
  /** La tabla todavía no existe en la base. No es un error de lectura: es una migración sin aplicar. */
  pendienteDeMigracion: boolean
  error: string | null
}

const COLUMNAS = 'id, nombre_archivo, tipo_mime, tamano_bytes, categoria, descripcion, creado_en, storage_path, drive_estado, drive_file_id'

export async function getDocumentosSubidos(
  supabase: SupabaseClient,
  tipo: TipoEntidad,
  entidadId: string,
): Promise<Subidos> {
  const { data, error } = await supabase
    .from('entidad_documento')
    .select(COLUMNAS)
    .eq('entidad_tipo', tipo)
    .eq('entidad_id', entidadId)
    .is('eliminado_en', null)
    .order('creado_en', { ascending: false })
    .limit(200)

  if (error) {
    // 42P01 = «relation does not exist». PostgREST lo devuelve como PGRST205/42P01 según la versión;
    // se reconoce por el código Y por el texto para no depender de cuál mande hoy.
    const falta = error.code === '42P01' || /does not exist|schema cache/i.test(error.message)
    return { filas: [], pendienteDeMigracion: falta, error: falta ? null : error.message }
  }

  const filas = (data ?? []) as (Omit<DocumentoSubido, 'url'> & { storage_path: string })[]
  if (filas.length === 0) return { filas: [], pendienteDeMigracion: false, error: null }

  // UNA SOLA LLAMADA PARA TODAS LAS FIRMAS. Una por fila serían veinte viajes a Storage para dibujar
  // una tabla de veinte renglones.
  const { data: firmas } = await supabase.storage
    .from(BUCKET_POR_TIPO[tipo])
    .createSignedUrls(filas.map((f) => f.storage_path), VIGENCIA)
  const porRuta = new Map((firmas ?? []).map((f) => [f.path ?? '', f.signedUrl ?? null]))

  return {
    filas: filas.map(({ storage_path, ...f }) => ({ ...f, url: porRuta.get(storage_path) ?? null })),
    pendienteDeMigracion: false,
    error: null,
  }
}
