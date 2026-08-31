// LA IDENTIDAD DE UN ARCHIVO ES SU ID, NUNCA SU NOMBRE.
//
// Este repo ya pagó las dos caras del error. «El nombre del archivo miente»: un archivo llamado
// "HM" era la libreta del IERIC. «Archivo fiscal duplicado en Drive»: dos archivos con el mismo
// nombre, distinto id, y se leyó la copia congelada de junio. La conclusión operativa es que el
// nombre es un ATRIBUTO, no una llave — y que mover o renombrar un archivo no puede convertirlo
// en un desconocido.
//
// Por eso todo lo que devuelve esta capacidad es una REFERENCIA con la misma forma, y esa forma
// incluye siempre `parents` y `trashed`. Sin `parents` no se puede verificar un move. Sin
// `trashed` una carpeta en la papelera se lee vacía y sin error, que es exactamente cómo se
// perdió tiempo la última vez.

/** El proveedor. Existe para que un día haya un segundo y el `file_id` no sea ambiguo. */
export const PROVEEDOR = 'google-drive'

export const MIME_CARPETA = 'application/vnd.google-apps.folder'

/** Los campos que Drive tiene que devolver para que una referencia esté completa.
 *  `getMeta` pedía cinco: sin parents, sin trashed, sin modifiedTime y sin hash. */
export const CAMPOS = 'id,name,mimeType,size,webViewLink,parents,trashed,modifiedTime,createdTime,md5Checksum,version,headRevisionId,properties,owners(emailAddress)'

/** Clave de la propiedad de Drive donde vive la clave de idempotencia. Ver `escritura.mjs`. */
export const PROP_IDEMPOTENCIA = 'xsas_idem'

export const esCarpeta = (mime) => String(mime ?? '') === MIME_CARPETA

/** Tipo legible, el mismo vocabulario que ya usan las tools y el índice. */
export function tipoLegible(mime) {
  const m = String(mime ?? '')
  if (esCarpeta(m)) return 'carpeta'
  if (m.includes('spreadsheet') || m.includes('excel')) return 'planilla'
  if (m.includes('document') || m.includes('word')) return 'documento'
  if (m.includes('presentation')) return 'presentacion'
  if (m.includes('pdf')) return 'pdf'
  if (m.startsWith('image/')) return 'imagen'
  return 'archivo'
}

const numeroONull = (v) => (v == null || v === '' ? null : Number(v))

/**
 * Normaliza la metadata cruda de Drive a la referencia canónica de la capacidad.
 *
 * `display_path` es lo que una persona lee y NO es identidad: viaja aparte, y se llena con el
 * `path` del índice cuando lo hay. Que sea un campo opcional es a propósito — un archivo sin
 * ruta conocida sigue siendo perfectamente identificable.
 */
export function referenciaDe(meta, { displayPath = null } = {}) {
  if (!meta?.id) return null
  const parents = Array.isArray(meta.parents) ? meta.parents.slice() : []
  return {
    provider: PROVEEDOR,
    file_id: meta.id,
    name: meta.name ?? null,
    mime_type: meta.mimeType ?? null,
    tipo: tipoLegible(meta.mimeType),
    is_folder: esCarpeta(meta.mimeType),
    parents,
    folder_id: parents[0] ?? null,
    display_path: displayPath,
    size_bytes: numeroONull(meta.size),
    // `md5Checksum` sólo existe para archivos con bytes propios: un Doc o un Sheet nativo no
    // tiene hash y decir que sí sería inventarlo. Para esos, `version` es el contador que sí
    // se mueve con cada cambio.
    hash: meta.md5Checksum ?? null,
    revision_id: meta.headRevisionId ?? (meta.version != null ? String(meta.version) : null),
    modified_at: meta.modifiedTime ?? null,
    created_at: meta.createdTime ?? null,
    trashed: meta.trashed === true,
    web_view_link: meta.webViewLink ?? enlaceDe(meta.id, meta.mimeType),
    owner_email: meta.owners?.[0]?.emailAddress ?? null,
    idempotency_key: meta.properties?.[PROP_IDEMPOTENCIA] ?? null,
  }
}

/** El enlace para abrirlo, cuando Drive no mandó `webViewLink`. */
export function enlaceDe(fileId, mime) {
  return esCarpeta(mime)
    ? `https://drive.google.com/drive/folders/${fileId}`
    : `https://drive.google.com/file/d/${fileId}/view`
}

/**
 * LO QUE SE COMPARA PARA DECIR «ESTO CAMBIÓ».
 *
 * Un `before`/`after` completo mete `modified_at` y `revision_id`, que cambian SIEMPRE: comparar
 * eso haría que toda operación pareciera exitosa. Lo que se verifica es lo que la operación
 * prometió tocar, y nada más.
 */
export function comparar(antes, despues, campos) {
  const diff = {}
  for (const c of campos) {
    const a = antes?.[c]
    const b = despues?.[c]
    const iguales = Array.isArray(a) && Array.isArray(b)
      ? a.length === b.length && a.every((x, i) => x === b[i])
      : a === b
    if (!iguales) diff[c] = { antes: a ?? null, despues: b ?? null }
  }
  return diff
}

/** Proyección corta de una referencia, para meter en un audit sin guardar el objeto entero. */
export function resumen(ref) {
  if (!ref) return null
  return {
    file_id: ref.file_id, name: ref.name, parents: ref.parents,
    mime_type: ref.mime_type, trashed: ref.trashed,
    revision_id: ref.revision_id, hash: ref.hash, modified_at: ref.modified_at,
  }
}
