// EL ARCHIVO VA DEL NAVEGADOR AL BUCKET, Y RECIÉN DESPUÉS LA FILA A LA TABLA.
//
// Las reglas puras están en `documentosProveedor.ts` y se prueban con `node --test`. Acá vive lo que
// toca la red: el `upload()` de Storage con la sesión del usuario y la Server Action con el renglón.
// Este módulo SÓLO se importa desde un componente cliente.
//
// ═══ POR QUÉ EL ARCHIVO NO PASA POR LA SERVER ACTION ═══
//
// El cuerpo de una Server Action tiene 1 MB de techo, y arriba de Next está Vercel, que corta en
// 4,5 MB. El techo de un documento acá es 50 MB —un contrato escaneado o un video corto de obra—,
// o sea que el caso que hay que soportar es justamente el que no entra. Es el mismo 500 «Body
// exceeded 1 MB limit» que ya rompió la carga de comprobantes el 25/08.
//
// ═══ PRIMERO EL ARCHIVO, DESPUÉS LA FILA ═══
//
// Si la fila naciera antes, una subida cortada dejaría la ficha listando un contrato que no está en
// ningún lado. Al revés, lo que queda es un objeto que nadie apunta —basura invisible en el bucket—
// y la persona ve el fallo del archivo que falló. Se elige la basura antes que la mentira.

import { createClient } from '@/lib/supabase/client'
import { registrarDocumento } from './documentosProveedorActions.ts'
import { rutaDeDocumento, traducirError, type CategoriaDocumento } from './documentosProveedor.ts'
import { enParalelo, type ResultadoDeArchivo } from './subidaComprobantes.ts'

const BUCKET = 'proveedores-documentos'

/** Cuántos archivos viajan a la vez. Ver el porqué en `enParalelo`. */
const EN_VUELO = 3

export type EstadoArchivo = 'en cola' | 'subiendo' | 'subido' | 'falló'

export interface DocumentoParaSubir {
  /** El uuid del archivo en esta pantalla. Es también el nombre del objeto en el bucket. */
  id: string
  archivo: File
  mediaType: string
}

/** Se llama en cada cambio de un archivo: es el progreso que ve la persona. */
export type AlCambiar = (id: string, estado: EstadoArchivo, error?: string) => void

export interface Reparto {
  subidos: number
  fallidos: number
  mensaje: string | null
  error: string | null
}

interface Subida {
  item: DocumentoParaSubir
  ruta: string | null
  error: string | null
}

export async function subirDocumentos(
  archivos: readonly DocumentoParaSubir[],
  destino: { proveedorId: string; categoria: CategoriaDocumento; descripcion: string },
  alCambiar: AlCambiar,
): Promise<{ resultados: ResultadoDeArchivo[]; reparto: Reparto }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return cerrar(archivos.map((a) => fallar(a, 'Tu sesión venció. Volvé a entrar y probá otra vez.', alCambiar)))
  }

  const subidas = await enParalelo(archivos, EN_VUELO, (a) => subirUno(supabase, a, {
    uid: user.id, proveedorId: destino.proveedorId,
  }, alCambiar))

  // EL RENGLÓN SE ESCRIBE POR ARCHIVO, no de a lote: cada documento tiene su propia fila y su propio
  // motivo de fallo. Un lote de cinco donde falla el tercero tiene que dejar los otros cuatro
  // guardados y decir cuál no entró.
  const resultados = await enParalelo(subidas, EN_VUELO, async (s) => {
    if (s.ruta === null) return fallar(s.item, s.error ?? 'No se pudo subir.', alCambiar)
    const alta = await registrarDocumento({
      proveedorId: destino.proveedorId,
      storagePath: s.ruta,
      nombreArchivo: s.item.archivo.name,
      tipoMime: s.item.mediaType,
      tamanoBytes: s.item.archivo.size,
      categoria: destino.categoria,
      descripcion: destino.descripcion.trim() || null,
    })
    // SIN FILA NO HAY DOCUMENTO. El archivo está en el bucket pero la ficha no lo va a listar nunca:
    // decir «subido» sería archivar un contrato en un lugar donde nadie lo va a encontrar.
    if (!alta.ok) return fallar(s.item, alta.error, alCambiar)
    alCambiar(s.item.id, 'subido')
    return { id: s.item.id, nombre: s.item.archivo.name, ok: true as const }
  })

  return cerrar(resultados)
}

function cerrar(resultados: ResultadoDeArchivo[]): { resultados: ResultadoDeArchivo[]; reparto: Reparto } {
  return { resultados, reparto: repartir(resultados) }
}

/**
 * QUÉ SE LE DICE A LA PERSONA CUANDO EL LOTE SALIÓ A MEDIAS.
 *
 * Las dos frases conviven o el mensaje miente: si tres de cinco entraron y sólo se muestra el verde,
 * alguien se va con dos contratos que cree guardados y no están.
 */
function repartir(rs: readonly ResultadoDeArchivo[]): Reparto {
  const entraron = rs.filter((r) => r.ok).length
  const fallaron = rs.filter((r): r is Extract<ResultadoDeArchivo, { ok: false }> => !r.ok)
  return {
    subidos: entraron,
    fallidos: fallaron.length,
    mensaje: entraron ? (entraron === 1 ? 'Documento guardado.' : `${entraron} documentos guardados.`) : null,
    error: fallaron.length
      ? `No ${fallaron.length === 1 ? 'entró' : 'entraron'}: ${fallaron.map((f) => `«${f.nombre}» — ${f.error}`).join(' · ')}`
      : null,
  }
}

function fallar(item: DocumentoParaSubir, error: string, alCambiar: AlCambiar): ResultadoDeArchivo {
  alCambiar(item.id, 'falló', error)
  return { id: item.id, nombre: item.archivo.name, ok: false, error }
}

type Cliente = ReturnType<typeof createClient>

/** Un archivo al bucket. NUNCA rechaza: es el contrato de `enParalelo`. */
async function subirUno(
  supabase: Cliente, item: DocumentoParaSubir, ctx: { uid: string; proveedorId: string }, alCambiar: AlCambiar,
): Promise<Subida> {
  alCambiar(item.id, 'subiendo')
  try {
    const ruta = rutaDeDocumento({
      uid: ctx.uid, proveedorId: ctx.proveedorId, id: item.id, nombre: item.archivo.name,
    })
    // `contentType` explícito: un `.docx` llega con `type` vacío en varios navegadores y sin esto
    // Storage lo guardaría como `text/plain`. `upsert: false`: el nombre es un uuid nuevo, así que
    // un choque sería una señal, no un reemplazo.
    const { error } = await supabase.storage
      .from(BUCKET).upload(ruta, item.archivo, { contentType: item.mediaType, upsert: false })
    if (error) return { item, ruta: null, error: traducirError(error.message) }
    return { item, ruta, error: null }
  } catch (e) {
    return { item, ruta: null, error: traducirError(e instanceof Error ? e.message : String(e)) }
  }
}
