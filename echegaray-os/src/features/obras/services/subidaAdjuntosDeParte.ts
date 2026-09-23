// LA FOTO VA DEL NAVEGADOR AL BUCKET, Y RECIÉN DESPUÉS LA FILA — sólo se importa desde un cliente.
//
// El mismo orden que Compras, Rendiciones, Herramientas y los documentos de proveedor: el archivo
// NO pasa por la Server Action (1 MB en Next, 4,5 MB en Vercel; una foto de celular pesa 2–8 MB y
// un video hasta 100), primero el objeto y después la fila (una fila sin objeto sería una foto que
// la grilla lista y no existe), de a tres por vez (lo reparte `FotosDelParte`), y cada archivo corre su suerte.
//
// ═══ LO QUE ES PROPIO DE ACÁ: COMPRIMIR ANTES DE SUBIR ═══
//
// Una foto de 4000×3000 y 6 MB por 4G tarda medio minuto; treinta fotos, un cuarto de hora. Se
// redibuja en un canvas al lado mayor de 2000 px y se guarda como JPEG 0,85 → 300–900 KB, que es lo
// que la pantalla muestra igual. ANTES de eso se lee el EXIF (cuándo se sacó), porque el canvas lo
// tira. Si el navegador no puede decodificar la imagen (HEIC en Chrome/Android), se sube el
// original tal cual: la evidencia no se pierde por no poder achicarla. Video y PDF viajan enteros.

import { createClient } from '@/lib/supabase/client'
import { registrarAdjuntoDeParte } from './parteAdjuntosActions.ts'
import {
  CALIDAD_JPEG, aTimestampLocal, descripcionFinal, fechaDeTomaExif, medidaComprimida, rutaDeAdjunto, seComprime,
  traducirError, type ClaseDeAdjunto,
} from './parteAdjuntos.ts'
import { BUCKET_ADJUNTOS } from './parteAdjuntosService.ts'

/** Cuántos bytes del JPEG se leen para el EXIF: el APP1 va al principio del archivo. */
const BYTES_EXIF = 256 * 1024

export type EstadoArchivo = 'en cola' | 'preparando' | 'subiendo' | 'registrando' | 'subido' | 'falló'

export interface AdjuntoParaSubir {
  /** El uuid del archivo en esta pantalla. Es también el nombre del objeto en el bucket. */
  id: string
  archivo: File
  mediaType: string
  clase: ClaseDeAdjunto
  /** El texto propio de esta foto, si la persona lo escribió antes de subir. */
  descripcion: string
}

export type AlCambiar = (id: string, estado: EstadoArchivo, error?: string) => void

export interface Destino {
  obraId: string
  fecha: string
  actividadId: string | null
  /** «Descripción del conjunto»: la reciben los archivos que no traen la suya. */
  descripcionDelConjunto: string
}

export type ResultadoDeArchivo =
  | { id: string; nombre: string; ok: true; adjuntoId: string }
  | { id: string; nombre: string; ok: false; error: string }

/**
 * Sube UN adjunto de punta a punta: EXIF → compresión → objeto → fila. Nunca rechaza. Se llama por
 * archivo para que «Reintentar» pueda repetir sólo ese.
 */
export async function subirAdjunto(item: AdjuntoParaSubir, destino: Destino, alCambiar: AlCambiar): Promise<ResultadoDeArchivo> {
  const fallar = (error: string): ResultadoDeArchivo => {
    alCambiar(item.id, 'falló', error)
    return { id: item.id, nombre: item.archivo.name, ok: false, error }
  }
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return fallar('Tu sesión venció. Volvé a entrar y probá otra vez.')

    alCambiar(item.id, 'preparando')
    const tomadaEn = item.mediaType === 'image/jpeg' ? await leerFechaDeToma(item.archivo) : null
    const preparado = seComprime(item.mediaType) ? await comprimirImagen(item.archivo) : null
    const cuerpo: Blob = preparado?.blob ?? item.archivo
    const mediaType = preparado ? 'image/jpeg' : item.mediaType
    const ruta = rutaDeAdjunto({ obraId: destino.obraId, fecha: destino.fecha, id: item.id, mediaType })

    alCambiar(item.id, 'subiendo')
    const { error } = await supabase.storage.from(BUCKET_ADJUNTOS)
      .upload(ruta, cuerpo, { contentType: mediaType, upsert: false })
    if (error) return fallar(traducirError(error.message))

    alCambiar(item.id, 'registrando')
    const alta = await registrarAdjuntoDeParte({
      obraId: destino.obraId, fecha: destino.fecha, actividadId: destino.actividadId,
      storagePath: ruta, nombreArchivo: item.archivo.name, tipoMime: mediaType, tamanoBytes: cuerpo.size,
      descripcion: descripcionFinal(item.descripcion, destino.descripcionDelConjunto), tomadaEn,
    })
    // SIN FILA NO HAY FOTO. El objeto está en el bucket pero la grilla no lo va a listar nunca.
    if (!alta.ok) return fallar(alta.error)
    alCambiar(item.id, 'subido')
    return { id: item.id, nombre: item.archivo.name, ok: true, adjuntoId: alta.dato }
  } catch (e) {
    return fallar(traducirError(e instanceof Error ? e.message : String(e)))
  }
}

/** Cuándo se sacó, del EXIF del JPEG, como ISO con zona. `null` = no se pudo leer. */
async function leerFechaDeToma(archivo: File): Promise<string | null> {
  try {
    const cabeza = await archivo.slice(0, BYTES_EXIF).arrayBuffer()
    const local = fechaDeTomaExif(cabeza)
    return local ? aTimestampLocal(local) : null
  } catch {
    return null
  }
}

/**
 * La imagen al lado mayor de 2000 px como JPEG 0,85. `null` = no se pudo (HEIC en Chrome, un PNG
 * corrupto, sin canvas): se sube el original. Si ya es chica y JPEG, igual se recodifica: lo que se
 * pierde (metadatos, un poco de calidad) vale menos que un tamaño predecible.
 * `imageOrientation: 'from-image'` aplica la rotación del EXIF antes de dibujar: sin eso la foto
 * vertical del teléfono se guarda acostada.
 */
export async function comprimirImagen(archivo: File): Promise<{ blob: Blob; ancho: number; alto: number } | null> {
  if (typeof document === 'undefined') return null
  let bitmap: ImageBitmap | HTMLImageElement | null = null
  try {
    bitmap = typeof createImageBitmap === 'function'
      ? await createImageBitmap(archivo, { imageOrientation: 'from-image' })
      : await cargarImg(archivo)
    const m = medidaComprimida(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = m.ancho
    canvas.height = m.alto
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, m.ancho, m.alto)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', CALIDAD_JPEG))
    if (!blob || blob.size === 0) return null
    return { blob, ancho: m.ancho, alto: m.alto }
  } catch {
    return null
  } finally {
    if (bitmap && 'close' in bitmap) bitmap.close()
  }
}

function cargarImg(archivo: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(archivo)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); res(img) }
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('no se pudo decodificar')) }
    img.src = url
  })
}
