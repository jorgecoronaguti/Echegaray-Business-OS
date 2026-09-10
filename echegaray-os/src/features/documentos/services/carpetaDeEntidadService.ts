// LA LECTURA DE LOS ARCHIVOS DE UNA ENTIDAD. Dos consultas: quién es, y qué cuelga de su carpeta.
//
// LA FUENTE ES `drive_index`, NUNCA DRIVE EN VIVO. La ficha se dibuja en Vercel y el token de Drive
// vive en la VM: una llamada en vivo al renderizar sería lenta cuando anda y una pantalla rota
// cuando Drive no contesta. El catálogo lo refresca el timer `drive-index` cada 6 h, y desde el H1
// nunca borra: marca ausente.
//
// EL PORTERO ES LA RLS, NO ESTE ARCHIVO. La fila de la entidad se pide con el cliente del usuario:
// si no puede leer la obra, no hay carpeta que resolver y el llamador hace `notFound()`. Y
// `drive_index` tiene su propia policy —`ve_economia() OR drive_file_id IN
// (drive_file_ids_vinculados())`—, así que a un jefe de obra le llegan sólo los archivos ya
// vinculados a sus obras. Eso NO se disimula: se declara con `alcance`, porque una lista recortada
// que se presenta como completa es la peor de las dos.

import type { SupabaseClient } from '@supabase/supabase-js'
import { veEconomia } from '@/features/auth/types/areas'
import type { Rol } from '@/features/auth/types'
import {
  FUENTE_DE_CARPETA, archivosDeLaCarpeta, estadoDeCarpeta, patronDeDescendencia, puedeListar,
  type ArchivoDeCarpeta, type Carpeta, type TipoEntidad,
} from './carpetaDeEntidad'

/** Tope de filas. Una carpeta de obra tiene entre 2 y 63 archivos; 300 es techo, no expectativa. */
export const TOPE_ARCHIVOS = 300

/**
 * Qué tan completa es la lista que se está mirando.
 *
 * `catalogo_completo` — el rol ve todo `drive_index`: lo que falta en la lista falta en Drive.
 * `solo_vinculados`  — la RLS recorta a los archivos vinculados. Una ausencia acá NO prueba nada.
 */
export type Alcance = 'catalogo_completo' | 'solo_vinculados'
export const alcanceDeLectura = (rol: Rol | null | undefined): Alcance =>
  veEconomia(rol) ? 'catalogo_completo' : 'solo_vinculados'

export interface ArchivosDeEntidad {
  carpeta: Carpeta
  archivos: ArchivoDeCarpeta[]
  alcance: Alcance
  /** Se llegó al tope: hay más archivos que los que se muestran. */
  truncado: boolean
  error: string | null
}

const vacio = (carpeta: Carpeta, alcance: Alcance, error: string | null = null): ArchivosDeEntidad =>
  ({ carpeta, archivos: [], alcance, truncado: false, error })

/**
 * La carpeta de Drive de una entidad. ÚNICA función que lo contesta en la app.
 *
 * No recibe el id de carpeta ya leído a propósito, aunque el llamador casi siempre lo tenga a mano:
 * `obras` y `obra_canonica` tienen las dos una columna `drive_carpeta_id` con contenidos distintos,
 * y el día que alguien pase la de la tabla equivocada la ficha mostraría los papeles de otra obra
 * sin fallar. Quién es la fuente lo dice `FUENTE_DE_CARPETA` y lo lee esta función.
 */
export async function getCarpetaDeEntidad(
  supabase: SupabaseClient,
  tipo: TipoEntidad,
  entidadId: string,
): Promise<Carpeta> {
  const fuente = FUENTE_DE_CARPETA[tipo]
  // Proveedores: no hay columna porque NO HAY CARPETAS DE PROVEEDOR EN DRIVE. Se contesta sin
  // consultar; inventar una consulta a una columna que no existe daría un 42703 que se lee como
  // «la base está rota» en vez de «falta una decisión».
  if (!fuente) return estadoDeCarpeta(tipo, null, null)

  const { data } = await supabase
    .from(fuente.tabla).select(fuente.columna).eq('id', entidadId).maybeSingle()
  const id = (data as Record<string, string | null> | null)?.[fuente.columna] ?? null
  if (!id) return estadoDeCarpeta(tipo, null, null)

  const { data: fila } = await supabase
    .from('drive_index')
    .select('drive_file_id, path, is_folder, trashed, ausente_en_drive, web_view_link')
    .eq('drive_file_id', id)
    .maybeSingle()
  return estadoDeCarpeta(tipo, id, fila)
}

/**
 * Los archivos que cuelgan de la carpeta de una entidad, del catálogo.
 *
 * SÓLO SE PIDEN LOS ARCHIVOS SI LA CARPETA PUEDE LISTARSE. Con la carpeta en la papelera el índice
 * devuelve cero hijos sin error, y dibujar «no hay archivos» sobre eso es la trampa que este hito
 * vino a cerrar.
 */
export async function getArchivosDeEntidad(
  supabase: SupabaseClient,
  tipo: TipoEntidad,
  entidadId: string,
  rol: Rol | null | undefined,
): Promise<ArchivosDeEntidad> {
  const alcance = alcanceDeLectura(rol)
  const carpeta = await getCarpetaDeEntidad(supabase, tipo, entidadId)
  if (!puedeListar(carpeta) || !carpeta.path) return vacio(carpeta, alcance)

  const { data, error } = await supabase
    .from('drive_index')
    .select('drive_file_id, name, path, mime_type, size_bytes, modified_time, web_view_link, trashed, ausente_en_drive')
    .eq('is_folder', false)
    .like('path', patronDeDescendencia(carpeta.path))
    .order('modified_time', { ascending: false, nullsFirst: false })
    .limit(TOPE_ARCHIVOS)
  if (error) return vacio(carpeta, alcance, error.message)

  const filas = data ?? []
  return {
    carpeta,
    archivos: archivosDeLaCarpeta(filas, carpeta.path),
    alcance,
    truncado: filas.length >= TOPE_ARCHIVOS,
    error: null,
  }
}
