// UN PAPEL QUE YA ESTÁ EN DRIVE ENTRA AL LEGAJO DEL OS — las reglas, sin red y sin base.
//
// El dueño subió los certificados de licencia a la carpeta de Drive de la persona (16/09/2026)
// porque el legajo no tenía por dónde recibirlos. Esto es el camino inverso al puente app→Drive:
// dado un file id de Drive, el archivo se copia al bucket `documentos-legajo` y nace su fila en
// `entidad_documento`, YA `copiado` y apuntando al file id de origen — el papel ya está en Drive,
// el consumidor del puente no tiene nada que hacer con él.
//
// DRIVE ES SÓLO LECTURA ACÁ: el script lee metadata y bytes, nunca mueve ni renombra el archivo.

import { createHash, randomUUID } from 'node:crypto'

export const BUCKET = 'documentos-legajo'
export const MAX_BYTES = 25 * 1024 * 1024
export const CATEGORIAS = Object.freeze([
  'certificado_medico', 'dni', 'alta_ieric', 'alta_arca', 'libreta_ieric', 'examen_medico', 'epp',
  'telegrama', 'contrato', 'constancia', 'otro',
])

/** Los mismos tipos que acepta la app (`subidaDeDocumento.ts`): PDF, imágenes y office. */
const EXT_POR_MIME = Object.freeze({
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/heic': 'heic', 'image/gif': 'gif',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls', 'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc', 'text/plain': 'txt',
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO = /^\d{4}-\d{2}-\d{2}$/
const esISO = (s) => typeof s === 'string' && ISO.test(s) && !Number.isNaN(Date.parse(s))

/** `--clave valor` → valor; `--flag` → true. Sin librería: son seis argumentos. */
export function leerArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const k = a.slice(2)
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) out[k] = true
    else { out[k] = v; i++ }
  }
  return out
}

/**
 * ¿EL PEDIDO SIRVE? Contesta con la lista de todo lo que falla, no con el primero: quien corre el
 * script con tres errores los arregla en una pasada.
 *
 * Las mismas reglas que la acción de la app y el CHECK `entidad_documento_licencia_solo_certificado`:
 * el certificado médico lleva desde/hasta obligatorios y ordenados; ninguna otra categoría los admite.
 */
export function revisarPedido(a) {
  const errores = []
  if (!a.file || typeof a.file !== 'string') errores.push('falta --file <id de Drive>')
  if (!UUID.test(String(a.persona ?? ''))) errores.push('falta --persona <uuid de personas.id>')
  const categoria = a.categoria ?? 'certificado_medico'
  if (!CATEGORIAS.includes(categoria)) errores.push(`--categoria «${categoria}» no es del legajo (${CATEGORIAS.join(', ')})`)
  const desde = a.desde ?? null
  const hasta = a.hasta ?? null
  if (categoria === 'certificado_medico') {
    if (!esISO(desde) || !esISO(hasta)) errores.push('el certificado médico necesita --desde y --hasta en AAAA-MM-DD')
    else if (hasta < desde) errores.push('--hasta es anterior a --desde')
    else if ((Date.parse(hasta) - Date.parse(desde)) / 86_400_000 > 366) errores.push('un certificado de más de un año no es un certificado')
  } else if (desde || hasta) {
    errores.push('sólo un certificado médico lleva --desde/--hasta')
  }
  if (a.fecha && !esISO(a.fecha)) errores.push('--fecha tiene que ser AAAA-MM-DD')
  if (!a.como || typeof a.como !== 'string' || !a.como.includes('@')) errores.push('falta --como <email del usuario que firma la subida>')
  return errores.length
    ? { ok: false, errores }
    : { ok: true, pedido: { file: a.file, persona: a.persona, categoria, desde, hasta, fecha: a.fecha ?? null, como: a.como, notas: a.notas ?? null } }
}

/** ¿El archivo de Drive entra? Tipo conocido, tamaño con techo, no un nativo de Google. */
export function revisarArchivo(meta) {
  const ext = EXT_POR_MIME[meta?.mimeType]
  if (!ext) return { ok: false, error: `«${meta?.name ?? '?'}» es ${meta?.mimeType ?? 'de tipo desconocido'}: acá entran PDF, imágenes y office` }
  const bytes = Number(meta.size)
  if (!Number.isFinite(bytes) || bytes <= 0) return { ok: false, error: 'Drive no informa el tamaño: no es un archivo binario' }
  if (bytes > MAX_BYTES) return { ok: false, error: `pesa ${(bytes / 1048576).toFixed(1)} MB y el techo del legajo es 25 MB` }
  return { ok: true, extension: ext, bytes }
}

export const md5De = (buf) => createHash('md5').update(buf).digest('hex')

/** `<uid>/persona/<persona_id>/<uuid>.<ext>` — la misma cerradura que la app: la primera carpeta es quien firma. */
export function rutaDeObjeto({ uid, personaId, extension, id = randomUUID() }) {
  if (!UUID.test(uid)) throw new Error(`uid inválido: ${uid}`)
  if (!UUID.test(personaId)) throw new Error(`persona inválida: ${personaId}`)
  return `${uid}/persona/${personaId}/${id}.${extension}`
}

/** La fila tal como se inserta. Nace `copiado`: el papel YA está en Drive y ése es su file id. */
export function filaDeEntidadDocumento({ pedido, meta, archivo, uid, ruta, md5 }) {
  return {
    entidad_tipo: 'persona',
    entidad_id: pedido.persona,
    bucket: BUCKET,
    storage_path: ruta,
    nombre_archivo: String(meta.name).slice(0, 255),
    tipo_mime: meta.mimeType,
    tamano_bytes: archivo.bytes,
    md5,
    categoria: pedido.categoria,
    descripcion: pedido.notas,
    subido_por: uid,
    fecha_documento: pedido.fecha,
    licencia_desde: pedido.desde,
    licencia_hasta: pedido.hasta,
    drive_estado: 'copiado',
    drive_file_id: pedido.file,
  }
}
