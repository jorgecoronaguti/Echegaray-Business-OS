// QUÉ ES ESTE ARCHIVO, ANTES DE ABRIRLO. NÚCLEO PURO: mira los bytes, no llama a nada.
//
// ═══ POR QUÉ EL MIME DE DRIVE NO ALCANZA ═══
//
// `drive_index` guarda el `mime_type` que declaró quien subió el archivo, y en la práctica miente:
// hay `application/octet-stream` que son PDF y `image/vnd.dwg` que son planos que nadie puede
// abrir. Elegir el extractor por un rótulo que no se verificó es cómo un pipeline documental
// empieza a fallar en silencio — pasa el PDF por el lector de imágenes, sale vacío, y el documento
// queda «procesado sin contenido» para siempre.
//
// Los primeros bytes de un archivo no mienten. Es una firma, no una opinión.

/** Las firmas que el OS necesita distinguir. Cada una es el arranque REAL del formato. */
const FIRMAS = [
  { tipo: 'pdf', mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },                    // %PDF
  { tipo: 'jpeg', mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { tipo: 'png', mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { tipo: 'zip', mime: 'application/zip', bytes: [0x50, 0x4b, 0x03, 0x04] },                    // xlsx/docx también
  { tipo: 'ole', mime: 'application/x-ole-storage', bytes: [0xd0, 0xcf, 0x11, 0xe0] },          // .xls/.doc viejos
  { tipo: 'tiff', mime: 'image/tiff', bytes: [0x49, 0x49, 0x2a, 0x00] },
  { tipo: 'tiff', mime: 'image/tiff', bytes: [0x4d, 0x4d, 0x00, 0x2a] },
]

/** Los formatos que hoy se pueden LEER. El resto se declara y no se procesa: un documento que el
 *  OS no sabe abrir tiene que decirlo, no fallar callado. */
export const LEIBLES = new Set(['pdf', 'jpeg', 'png', 'tiff'])

/**
 * El formato REAL de unos bytes.
 * @param {Buffer|Uint8Array} bytes
 * @param {string} [mimeDeclarado] el que dijo Drive; se devuelve para poder comparar
 */
export function detectarFormato(bytes, mimeDeclarado = null) {
  const b = bytes ?? []
  for (const f of FIRMAS) {
    if (f.bytes.every((v, i) => b[i] === v)) {
      return { tipo: f.tipo, mime: f.mime, leible: LEIBLES.has(f.tipo), mimeDeclarado, coincide: !mimeDeclarado || mimeDeclarado === f.mime }
    }
  }
  return { tipo: 'desconocido', mime: null, leible: false, mimeDeclarado, coincide: false }
}
