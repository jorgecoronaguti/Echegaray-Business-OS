// LA FOTO DE UN ACTIVO — las reglas, sin red, sin Supabase y sin React.
//
// ═══ EL DEFECTO QUE ESTO CORRIGE (dueño, 23/09/2026: «está roto lo de carga de foto por herramienta,
// lo intenté hacer con el celular y no funcionó») ═══
//
// La foto viajaba DENTRO del cuerpo de una Server Action (`FormData` con el `File`), y ese cuerpo tiene
// 1 MB de techo en Next y 4,5 MB en Vercel. Una foto de celular pesa entre 2 y 8 MB: la acción moría
// con «Body exceeded 1 MB limit» antes de ejecutar una línea, la promesa del cliente rechazaba sin
// `Resultado` y la pantalla quedaba en «Subiendo…» para siempre. Evidencia: el bucket `herramientas`
// existe desde el 15/07 con sus cuatro policies y tenía CERO objetos el 23/09; ninguna foto entró nunca.
//
// El arreglo es el mismo que Compras (`administracion/services/subidaComprobantes.ts`) y Rendiciones:
// el navegador pone el archivo en el bucket con la sesión del usuario —la policy `herramientas_img_insert`
// deja escribir a cualquier usuario logueado, permisos iguales para todos— y la Server Action recibe
// SÓLO la ruta del objeto. Acá viven las reglas puras de ese camino; lo que toca la red está en
// `services/subida-foto.ts`.

/** Lo mínimo de un `File` para decidir. Estructural: un `File` encaja, y un test no necesita uno. */
export interface ArchivoDeFoto {
  name: string
  type?: string
  size: number
}

export const BUCKET_FOTOS = 'herramientas'

/** Techo de una foto. El bucket no tiene límite propio; arriba de esto la subida por 4G tarda demasiado. */
export const MAX_BYTES_FOTO = 12 * 1024 * 1024

/**
 * Los tipos que un navegador después puede MOSTRAR en la ficha. HEIC/HEIF quedan afuera a propósito:
 * Storage lo guarda sin quejarse, pero Chrome y Android no lo renderizan y la ficha mostraría una foto
 * rota. Con `accept="image/*"` (sin nombrar heic) el iPhone convierte a JPEG solo, así que en la
 * práctica sólo llega HEIC si alguien lo elige desde un archivo, y en ese caso se le dice qué hacer.
 */
const TIPOS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
const POR_EXTENSION: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }

export type ControlDeFoto = { ok: true; mediaType: string; extension: string } | { ok: false; error: string }

/** Qué entra y qué no. El tipo sale del `type`; si el navegador no lo trae, de la extensión del nombre. */
export function controlarFoto(f: ArchivoDeFoto): ControlDeFoto {
  const ext = (f.name.split('.').pop() ?? '').toLowerCase()
  const tipo = (f.type && f.type !== 'application/octet-stream' ? f.type : POR_EXTENSION[ext] ?? '').toLowerCase()
  if (/heic|heif/.test(tipo) || ext === 'heic' || ext === 'heif') {
    return { ok: false, error: 'Esa foto está en HEIC y la ficha no la puede mostrar. Sacala con la cámara desde acá o pasala a JPG.' }
  }
  if (!TIPOS[tipo]) return { ok: false, error: 'La foto tiene que ser una imagen (JPG, PNG o WEBP).' }
  if (f.size <= 0) return { ok: false, error: 'La foto está vacía.' }
  if (f.size > MAX_BYTES_FOTO) return { ok: false, error: `La foto pesa más de ${MAX_BYTES_FOTO / (1024 * 1024)} MB. Sacala en menor calidad.` }
  return { ok: true, mediaType: tipo, extension: TIPOS[tipo] }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RUTA = /^activos\/[A-Za-z0-9_-]{1,80}\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/

/**
 * EL NOMBRE DEL OBJETO EN EL BUCKET: `activos/<carpeta>/<uuid>.<ext>`.
 *
 * La carpeta es el id del activo (foto de la ficha), `incidencias_<id>` (foto de un reporte) o
 * `alta` (todavía no hay id). El nombre del archivo es un uuid que elige el navegador: dos fotos
 * sacadas en el mismo milisegundo desde dos teléfonos no pueden chocar, y un nombre inventado por el
 * teléfono («IMG_0001.jpg») nunca decide cómo se guarda.
 */
export function rutaDeFoto(p: { carpeta: string; id: string; extension: string }): string {
  if (!UUID.test(p.id)) throw new Error(`La ruta de la foto necesita un id válido; vino «${p.id}».`)
  const carpeta = p.carpeta.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'alta'
  return `activos/${carpeta}/${p.id.toLowerCase()}.${p.extension}`
}

/** La misma pregunta del lado del servidor: ¿esta ruta tiene la forma que arma `rutaDeFoto`? */
export function esRutaDeFoto(ruta: unknown): ruta is string {
  return typeof ruta === 'string' && RUTA.test(ruta)
}

/** La URL pública con la que la ficha muestra la foto (el bucket es público para leer). */
export function urlPublicaDeFoto(baseSupabase: string, ruta: string): string {
  return `${baseSupabase.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET_FOTOS}/${ruta}`
}

/** El error de Storage, dicho para quien está con el teléfono en la mano. Si no se reconoce, tal cual. */
export function traducirErrorDeFoto(mensaje: string): string {
  if (/permission denied|row-level security|violates row-level|not authorized|unauthorized/i.test(mensaje)) {
    return 'Hace falta entrar con tu usuario para guardar la foto. Volvé a entrar y probá otra vez.'
  }
  if (/bucket not found/i.test(mensaje)) return 'Todavía no está creado el depósito de fotos en la base. Avisale a Dirección.'
  if (/duplicate key|resource already exists|already exists/i.test(mensaje)) return 'Esa foto ya estaba guardada. Probá de nuevo.'
  if (/exceeded the maximum allowed size|payload too large|entity too large|body exceeded/i.test(mensaje)) {
    return `La foto pesa más de ${MAX_BYTES_FOTO / (1024 * 1024)} MB. Sacala en menor calidad.`
  }
  if (/mime type .* is not supported|invalid mime/i.test(mensaje)) return 'Ese tipo de archivo no sirve como foto. Se aceptan JPG, PNG y WEBP.'
  if (/jwt expired|invalid claim|token is expired/i.test(mensaje)) return 'Tu sesión venció mientras subía. Volvé a entrar y probá otra vez.'
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(mensaje)) {
    return 'Se cortó la conexión mientras subía. Probá de nuevo cuando tengas señal.'
  }
  return mensaje
}
