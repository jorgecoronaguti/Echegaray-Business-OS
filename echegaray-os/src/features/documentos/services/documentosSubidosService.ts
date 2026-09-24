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
import { diasCubiertos, type DiaDeclarado } from './certificadoDeLicencia'
import { nombresDeUsuarios } from '../../../shared/personas/nombresDeUsuarios.ts'

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
  /** Quién lo subió, por nombre. `null` = sin perfil legible, no «nadie». */
  subido_por_nombre: string | null
  /** La fecha que dice el papel (16/09/2026). `null` en lo subido antes o sin cargar. */
  fecha_documento: string | null
  /** Sólo certificado médico: el rango que respalda. */
  licencia_desde: string | null
  licencia_hasta: string | null
  /** Sólo certificado médico: días de licencia declarada que cubre. `null` = no se pudo cruzar. */
  cubre: number | null
}

export interface Subidos {
  filas: DocumentoSubido[]
  /** La tabla todavía no existe en la base. No es un error de lectura: es una migración sin aplicar. */
  pendienteDeMigracion: boolean
  error: string | null
}

const COLUMNAS = 'id, nombre_archivo, tipo_mime, tamano_bytes, categoria, descripcion, creado_en, storage_path, drive_estado, drive_file_id, subido_por, fecha_documento, licencia_desde, licencia_hasta'

type FilaCruda = Omit<DocumentoSubido, 'url' | 'subido_por_nombre' | 'cubre'> & { storage_path: string; subido_por: string }

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

  const filas = (data ?? []) as unknown as FilaCruda[]
  if (filas.length === 0) return { filas: [], pendienteDeMigracion: false, error: null }

  // UNA SOLA LLAMADA PARA TODAS LAS FIRMAS. Una por fila serían veinte viajes a Storage para dibujar
  // una tabla de veinte renglones. Los nombres y la cobertura van en paralelo: son tres lecturas
  // independientes y ninguna espera a la otra.
  const [{ data: firmas }, nombres, cubiertos] = await Promise.all([
    supabase.storage.from(BUCKET_POR_TIPO[tipo]).createSignedUrls(filas.map((f) => f.storage_path), VIGENCIA),
    nombresDeQuienesSubieron(supabase, filas),
    tipo === 'persona' ? coberturaDeCertificados(supabase, entidadId, filas) : new Map<string, number>(),
  ])
  const porRuta = new Map((firmas ?? []).map((f) => [f.path ?? '', f.signedUrl ?? null]))

  return {
    filas: filas.map(({ storage_path, subido_por, ...f }) => ({
      ...f,
      url: porRuta.get(storage_path) ?? null,
      subido_por_nombre: nombres.get(subido_por) ?? null,
      cubre: cubiertos.get(f.id) ?? null,
    })),
    pendienteDeMigracion: false,
    error: null,
  }
}

/** El mismo cruce que hace la ficha del proveedor: `perfiles` por uid. Sin perfil, sin nombre. */
async function nombresDeQuienesSubieron(
  supabase: SupabaseClient, filas: readonly FilaCruda[],
): Promise<Map<string, string>> {
  const nombres = new Map<string, string>()
  const uids = [...new Set(filas.map((f) => f.subido_por).filter(Boolean))]
  if (!uids.length) return nombres
  // El nombre de su persona, resuelto por el vínculo (src/shared/personas).
  const todos = await nombresDeUsuarios(supabase)
  for (const id of uids) { const n = id ? todos.get(String(id)) : undefined; if (n) nombres.set(String(id), n) }
  return nombres
}

/**
 * CUÁNTOS DÍAS DE LICENCIA DECLARADA RESPALDA CADA CERTIFICADO. Una sola lectura de `asistencia_dia`
 * sobre la ventana que abarca todos los certificados de la persona, y el cruce en memoria: son
 * pocos papeles y pocas filas. Si la lectura falla no hay mapa, y la ficha dice «sin cruzar» — no 0.
 */
async function coberturaDeCertificados(
  supabase: SupabaseClient, personaId: string, filas: readonly FilaCruda[],
): Promise<Map<string, number>> {
  const certificados = filas.filter((f) => f.licencia_desde && f.licencia_hasta)
  const salida = new Map<string, number>()
  if (!certificados.length) return salida
  const desde = certificados.map((c) => c.licencia_desde as string).sort()[0]
  const hasta = certificados.map((c) => c.licencia_hasta as string).sort().at(-1) as string
  const { data, error } = await supabase.from('asistencia_dia').select('fecha, estado, motivo')
    .eq('persona_id', personaId).gte('fecha', desde).lte('fecha', hasta)
  if (error) return salida
  const declarados = (data ?? []) as DiaDeclarado[]
  for (const c of certificados) {
    salida.set(c.id, diasCubiertos(declarados, c.licencia_desde as string, c.licencia_hasta as string).length)
  }
  return salida
}
