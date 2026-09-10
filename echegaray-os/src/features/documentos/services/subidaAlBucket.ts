// EL ARCHIVO VA DEL NAVEGADOR AL BUCKET, Y RECIÉN DESPUÉS LA FILA A LA TABLA.
//
// Las reglas puras están en `subidaDeDocumento.ts` y se prueban con `node --test`. Acá vive lo que
// toca la red. Este módulo SÓLO se importa desde un componente cliente.
//
// ═══ PRIMERO EL ARCHIVO, DESPUÉS LA FILA ═══
//
// Si la fila naciera antes, una subida cortada dejaría la ficha listando un plano que no está en
// ningún lado. Al revés, lo que queda es un objeto que nadie apunta —basura invisible en el bucket—
// y la persona ve el fallo del archivo que falló. Se elige la basura antes que la mentira. Es la
// misma decisión, con el mismo motivo, que tomó la subida de documentos del proveedor.

import { createClient } from '@/lib/supabase/client'
import { traducirError } from '@/features/administracion/services/documentosProveedor'
import { registrarDocumentoDeEntidad } from './subidaActions'
import {
  BUCKET_POR_TIPO, archivoEntra, rutaDeObjeto, type Categoria, type TipoEntidad,
} from './subidaDeDocumento'

export interface Destino {
  tipo: TipoEntidad
  entidadId: string
  categoria: Categoria
  descripcion: string
}

export interface ResultadoDeArchivo {
  nombre: string
  ok: boolean
  error: string | null
}

export interface Reparto {
  resultados: ResultadoDeArchivo[]
  mensaje: string | null
  error: string | null
}

/**
 * Sube los archivos elegidos y registra cada uno.
 *
 * DE A UNO Y EN ORDEN: son como mucho un puñado de papeles por vez, y el paralelismo acá compra
 * milisegundos a cambio de un error de RLS repetido cinco veces en pantalla. Cada archivo tiene su
 * propio resultado: un lote donde falla el tercero deja los otros guardados y dice cuál no entró.
 */
export async function subirDocumentos(archivos: readonly File[], destino: Destino): Promise<Reparto> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return cerrar(archivos.map((a) => ({ nombre: a.name, ok: false, error: 'Tu sesión venció. Volvé a entrar.' })))
  }

  const resultados: ResultadoDeArchivo[] = []
  for (const archivo of archivos) {
    // LA MISMA REVISIÓN QUE HIZO EL FORMULARIO, OTRA VEZ. No es redundancia: entre elegir y apretar
    // el botón alguien pudo cambiar el archivo, y el servidor vuelve a preguntarlo por tercera vez.
    const control = archivoEntra(archivo)
    if (!control.ok) { resultados.push({ nombre: archivo.name, ok: false, error: control.error }); continue }

    const id = crypto.randomUUID()
    let ruta: string
    try {
      ruta = rutaDeObjeto({ uid: user.id, tipo: destino.tipo, entidadId: destino.entidadId, id, nombre: archivo.name })
    } catch (e) {
      resultados.push({ nombre: archivo.name, ok: false, error: e instanceof Error ? e.message : String(e) })
      continue
    }

    // `contentType` explícito: un `.docx` llega con `type` vacío en varios navegadores y sin esto
    // Storage lo guardaría como `text/plain`. `upsert: false`: el nombre es un uuid nuevo, así que
    // un choque sería una señal, no un reemplazo.
    const { error } = await supabase.storage
      .from(BUCKET_POR_TIPO[destino.tipo])
      .upload(ruta, archivo, { contentType: control.dato.mediaType, upsert: false })
    if (error) { resultados.push({ nombre: archivo.name, ok: false, error: traducirError(error.message) }); continue }

    const alta = await registrarDocumentoDeEntidad({
      tipo: destino.tipo,
      entidadId: destino.entidadId,
      storagePath: ruta,
      nombreArchivo: archivo.name,
      tipoMime: control.dato.mediaType,
      tamanoBytes: archivo.size,
      categoria: destino.categoria,
      descripcion: destino.descripcion.trim() || null,
    })
    // SIN FILA NO HAY DOCUMENTO: el archivo está en el bucket pero la ficha no lo va a listar nunca.
    // Decir «subido» sería archivar un papel donde nadie lo va a encontrar.
    resultados.push({ nombre: archivo.name, ok: alta.ok, error: alta.ok ? null : alta.error })
  }

  return cerrar(resultados)
}

/**
 * QUÉ SE LE DICE A LA PERSONA CUANDO EL LOTE SALIÓ A MEDIAS.
 *
 * Las dos frases conviven o el mensaje miente: si dos de tres entraron y sólo se muestra el verde,
 * alguien se va con un papel que cree guardado y no está.
 */
export function cerrar(resultados: ResultadoDeArchivo[]): Reparto {
  const entraron = resultados.filter((r) => r.ok).length
  const fallaron = resultados.filter((r) => !r.ok)
  return {
    resultados,
    mensaje: entraron ? (entraron === 1 ? 'Documento guardado.' : `${entraron} documentos guardados.`) : null,
    error: fallaron.length
      ? `No ${fallaron.length === 1 ? 'entró' : 'entraron'}: ${fallaron.map((f) => `«${f.nombre}» — ${f.error}`).join(' · ')}`
      : null,
  }
}
