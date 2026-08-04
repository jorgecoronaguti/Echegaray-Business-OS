// QUÉ ES ESTE ARCHIVO DE VERDAD — por sus BYTES, no por cómo se llama.
//
// ═══ POR QUÉ NO ALCANZA EL NOMBRE ═══
//
// El nombre y el `mime_type` que devuelve Mattermost los pone quien sube el archivo. Un extracto
// guardado desde el homebanking llega como `movimientos.xls` siendo un CSV de texto; una foto sacada
// del celular llega como `.jpeg` y a veces como `application/octet-stream`; y WhatsApp renombra todo.
// Rutear por el nombre significa mandar un CSV al lector de imágenes —que contesta "no puedo mirar un
// archivo application/vnd.ms-excel"— y dejar al dueño con la impresión de que el bot no sabe leer.
// Ese es exactamente el caso que originó este módulo: el CSV del banco que hubo que bajar a mano.
//
// ═══ EL ORDEN DE AUTORIDAD ═══
//
//   1. LOS BYTES. Una firma de archivo (magic number) no la escribe nadie: la escribe el programa que
//      generó el archivo. Es la única fuente que no miente.
//   2. LA EXTENSIÓN, sólo para desambiguar lo que los bytes no distinguen: un .xlsx y un .docx son el
//      MISMO contenedor ZIP, y un .csv y un .txt son el mismo texto plano.
//   3. EL MIME DECLARADO, último y sólo como pista: es lo que dijo el que subió.
//
// Cuando (1) y (2) se contradicen, gana (1) y la contradicción se DECLARA (`discrepancia`). Callarla
// sería lo mismo que inventar: quien recibe el resultado tiene que poder decir "esto dice .jpg y es
// un PDF" en vez de tratarlo como si nada hubiera pasado.
//
// NÚCLEO PURO: no toca red, ni base, ni disco, ni modelo. Entra un Buffer y sale un veredicto.

/** Familias de destino. Cada una tiene un camino distinto en `comunicacion/archivos/flujo.mjs`. */
export const FAMILIA = Object.freeze({
  IMAGEN: 'imagen',
  PDF: 'pdf',
  PLANILLA: 'planilla', // csv, xlsx, xls — lo que puede traer filas
  TEXTO: 'texto',
  OTRO: 'otro',
  VACIO: 'vacio',
  ILEGIBLE: 'ilegible', // hay bytes pero no son de ningún formato reconocible NI texto
})

/** Techo por archivo. Arriba de esto no se baja: se dice el tamaño y se para. 25 MB es el techo de
 *  subida de Mattermost por defecto; leer 25 MB de un Excel en el worker es aceptable, 200 MB no. */
export const MAX_BYTES = Number(process.env.ORQ_ARCHIVOS_MAX_BYTES || 25 * 1024 * 1024)

/** Techo de adjuntos por post. Un post con 40 archivos no es un pedido: es un accidente. */
export const MAX_ARCHIVOS = Number(process.env.ORQ_ARCHIVOS_MAX || 10)

const b = (...n) => Buffer.from(n)
const TXT = (s) => Buffer.from(s, 'latin1')

/**
 * Firmas por bytes iniciales. El orden importa sólo en que ninguna es prefijo de otra.
 * `offset` para los contenedores que llevan su firma corrida (WEBP y AVIF viven adentro de un RIFF/ftyp).
 */
const FIRMAS = [
  { firma: b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), formato: 'png', mime: 'image/png', familia: FAMILIA.IMAGEN },
  { firma: b(0xff, 0xd8, 0xff), formato: 'jpeg', mime: 'image/jpeg', familia: FAMILIA.IMAGEN },
  { firma: TXT('GIF87a'), formato: 'gif', mime: 'image/gif', familia: FAMILIA.IMAGEN },
  { firma: TXT('GIF89a'), formato: 'gif', mime: 'image/gif', familia: FAMILIA.IMAGEN },
  { firma: TXT('BM'), formato: 'bmp', mime: 'image/bmp', familia: FAMILIA.IMAGEN },
  { firma: b(0x49, 0x49, 0x2a, 0x00), formato: 'tiff', mime: 'image/tiff', familia: FAMILIA.IMAGEN },
  { firma: b(0x4d, 0x4d, 0x00, 0x2a), formato: 'tiff', mime: 'image/tiff', familia: FAMILIA.IMAGEN },
  { firma: TXT('%PDF-'), formato: 'pdf', mime: 'application/pdf', familia: FAMILIA.PDF },
  // OLE2 / Compound File: el .xls, .doc y .ppt viejos comparten contenedor. Se separan por extensión.
  { firma: b(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), formato: 'ole2', mime: null, familia: null },
  // ZIP: xlsx, docx, pptx y un .zip común comparten contenedor. Se separan mirando adentro.
  { firma: b(0x50, 0x4b, 0x03, 0x04), formato: 'zip', mime: null, familia: null },
  { firma: b(0x50, 0x4b, 0x05, 0x06), formato: 'zip', mime: null, familia: null }, // zip vacío
  { firma: b(0x1f, 0x8b), formato: 'gzip', mime: 'application/gzip', familia: FAMILIA.OTRO },
  { firma: TXT('Rar!'), formato: 'rar', mime: 'application/vnd.rar', familia: FAMILIA.OTRO },
  { firma: TXT('7z\xbc\xaf'), formato: '7z', mime: 'application/x-7z-compressed', familia: FAMILIA.OTRO },
]

const RIFF = TXT('RIFF')
const WEBP = TXT('WEBP')

/** La extensión en minúsculas y sin punto, o null. Un nombre sin punto no tiene extensión. */
export function extensionDe(nombre) {
  const s = String(nombre ?? '').trim()
  const i = s.lastIndexOf('.')
  if (i <= 0 || i === s.length - 1) return null
  const ext = s.slice(i + 1).toLowerCase()
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : null
}

/** Qué familia sugiere una extensión. Es la PISTA, nunca el veredicto. */
const POR_EXTENSION = {
  jpg: FAMILIA.IMAGEN, jpeg: FAMILIA.IMAGEN, png: FAMILIA.IMAGEN, gif: FAMILIA.IMAGEN,
  webp: FAMILIA.IMAGEN, bmp: FAMILIA.IMAGEN, tif: FAMILIA.IMAGEN, tiff: FAMILIA.IMAGEN, heic: FAMILIA.IMAGEN,
  pdf: FAMILIA.PDF,
  csv: FAMILIA.PLANILLA, tsv: FAMILIA.PLANILLA, xls: FAMILIA.PLANILLA, xlsx: FAMILIA.PLANILLA,
  xlsm: FAMILIA.PLANILLA, ods: FAMILIA.PLANILLA,
  txt: FAMILIA.TEXTO, md: FAMILIA.TEXTO, json: FAMILIA.TEXTO, xml: FAMILIA.TEXTO, log: FAMILIA.TEXTO,
}

/** Dentro de un ZIP los nombres de las entradas viajan en claro: eso distingue un xlsx de un docx. */
function dentroDelZip(buf) {
  // Las primeras entradas de un OOXML son `[Content_Types].xml` y la carpeta del tipo. Se mira todo
  // el buffer y no sólo el principio: un xlsx con muchas hojas puede tener `xl/` recién más adentro.
  const s = buf.toString('latin1')
  if (s.includes('xl/workbook.xml') || s.includes('xl/_rels') || s.includes('xl/worksheets')) return 'xlsx'
  if (s.includes('word/document.xml') || s.includes('word/_rels')) return 'docx'
  if (s.includes('ppt/presentation.xml') || s.includes('ppt/slides')) return 'pptx'
  if (s.includes('content.xml') && s.includes('opendocument.spreadsheet')) return 'ods'
  return null
}

/**
 * ¿Estos bytes son texto? Se decide por lo que NO puede haber en texto: un NUL, o una proporción
 * alta de bytes de control. Un CSV con acentos mal codificados (latin1) sigue siendo texto y tiene
 * que poder leerse — por eso no se exige UTF-8 válido.
 */
function pareceTexto(buf) {
  const n = Math.min(buf.length, 8192)
  if (n === 0) return false
  let control = 0
  for (let i = 0; i < n; i++) {
    const c = buf[i]
    if (c === 0) return false // un NUL descarta texto de plano
    // Tab, LF, CR, FF son legítimos; el resto de los <0x20 y el 0x7F son control.
    if ((c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d && c !== 0x0c) || c === 0x7f) control++
  }
  return control / n < 0.05
}

/** Un texto con separadores repetidos en varias líneas es una TABLA, no prosa. */
export function pareceTabla(texto) {
  const lineas = String(texto ?? '').split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() !== '')
  if (lineas.length < 2) return false
  for (const sep of [';', '\t', ',', '|']) {
    const cuentas = lineas.slice(0, 20).map((l) => l.split(sep).length - 1)
    const conSep = cuentas.filter((c) => c >= 2).length
    if (conSep >= Math.min(2, cuentas.length) && conSep / cuentas.length >= 0.6) return true
  }
  return false
}

/**
 * El veredicto sobre un archivo.
 *
 * @param {object} o
 * @param {Buffer} o.bytes             el contenido REAL (puede venir truncado: la firma está al principio)
 * @param {string} [o.nombre]          como lo subieron
 * @param {string} [o.mimeDeclarado]   lo que dijo Mattermost
 * @param {number} [o.tamano]          bytes totales del archivo (puede ser mayor que `bytes.length`)
 * @returns {{familia:string, formato:string|null, mime:string|null, extension:string|null,
 *            tamano:number, nombre:string, discrepancia:string|null, motivo:string}}
 */
export function detectarFormato({ bytes, nombre = '', mimeDeclarado = null, tamano = null } = {}) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? [])
  const ext = extensionDe(nombre)
  const size = Number.isFinite(tamano) ? Number(tamano) : buf.length
  const base = { extension: ext, tamano: size, nombre: String(nombre ?? ''), mimeDeclarado: mimeDeclarado ?? null }

  // UN ARCHIVO VACÍO NO ES UN ARCHIVO ILEGIBLE. Son dos problemas distintos y se contestan distinto:
  // "no tiene contenido" manda a revisar la exportación; "no lo entiendo" manda a mandarlo de otra forma.
  if (size === 0 || buf.length === 0) {
    return { ...base, familia: FAMILIA.VACIO, formato: null, mime: null, discrepancia: null, motivo: 'el archivo no tiene contenido' }
  }

  // 1) LOS BYTES.
  let firma = FIRMAS.find((f) => buf.length >= f.firma.length && buf.subarray(0, f.firma.length).equals(f.firma)) ?? null

  // WEBP y AVIF viven adentro de otro contenedor: la firma no está en el byte 0.
  if (!firma && buf.length >= 12 && buf.subarray(0, 4).equals(RIFF) && buf.subarray(8, 12).equals(WEBP)) {
    firma = { formato: 'webp', mime: 'image/webp', familia: FAMILIA.IMAGEN }
  }
  if (!firma && buf.length >= 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp') {
    const marca = buf.subarray(8, 12).toString('latin1')
    if (/heic|heix|hevc|mif1|avif/.test(marca)) {
      firma = { formato: marca.startsWith('avif') ? 'avif' : 'heic', mime: marca.startsWith('avif') ? 'image/avif' : 'image/heic', familia: FAMILIA.IMAGEN }
    }
  }

  if (firma && firma.formato === 'zip') {
    const adentro = dentroDelZip(buf)
    if (adentro === 'xlsx') {
      return veredicto(base, FAMILIA.PLANILLA, ext === 'xlsm' ? 'xlsm' : 'xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'el contenedor ZIP trae `xl/`: es una planilla de Excel')
    }
    if (adentro === 'docx') {
      return veredicto(base, FAMILIA.OTRO, 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'el contenedor ZIP trae `word/`: es un documento de Word')
    }
    if (adentro === 'pptx') {
      return veredicto(base, FAMILIA.OTRO, 'pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'el contenedor ZIP trae `ppt/`')
    }
    if (adentro === 'ods') {
      return veredicto(base, FAMILIA.PLANILLA, 'ods', 'application/vnd.oasis.opendocument.spreadsheet', 'es una planilla OpenDocument')
    }
    return veredicto(base, FAMILIA.OTRO, 'zip', 'application/zip', 'es un ZIP; el OS no abre archivos comprimidos')
  }

  if (firma && firma.formato === 'ole2') {
    // El contenedor viejo de Office. La extensión es lo único que separa un .xls de un .doc.
    if (ext === 'doc') return veredicto(base, FAMILIA.OTRO, 'doc', 'application/msword', 'documento de Word anterior a 2007')
    if (ext === 'ppt') return veredicto(base, FAMILIA.OTRO, 'ppt', 'application/vnd.ms-powerpoint', 'presentación anterior a 2007')
    return veredicto(base, FAMILIA.PLANILLA, 'xls', 'application/vnd.ms-excel', 'planilla de Excel anterior a 2007')
  }

  if (firma && firma.familia) {
    return veredicto(base, firma.familia, firma.formato, firma.mime, `la firma del archivo dice ${firma.formato}`)
  }

  // 2) SIN FIRMA: ¿es texto? Es el caso del CSV, y el más importante de todos acá.
  if (pareceTexto(buf)) {
    const texto = buf.toString('utf8')
    const tabla = pareceTabla(texto)
    if (tabla) {
      return veredicto(base, FAMILIA.PLANILLA, ext === 'tsv' ? 'tsv' : 'csv', 'text/csv',
        'es texto con columnas separadas en varias líneas')
    }
    return veredicto(base, FAMILIA.TEXTO, ext === 'json' ? 'json' : (ext ?? 'txt'), 'text/plain', 'es texto plano sin columnas')
  }

  // 3) NI FIRMA NI TEXTO. No se adivina por el nombre: se dice que no se pudo reconocer. Un archivo
  //    corrupto y uno de un formato exótico se ven igual desde acá, y las dos respuestas honestas son
  //    la misma: "no sé qué es esto".
  return {
    ...base,
    familia: FAMILIA.ILEGIBLE,
    formato: null,
    mime: mimeDeclarado ?? null,
    discrepancia: ext ? `dice ser .${ext} pero su contenido no corresponde a ningún formato que reconozca` : null,
    motivo: 'los bytes no coinciden con ningún formato conocido y tampoco son texto',
  }
}

/** Arma el veredicto y DECLARA la contradicción entre lo que dicen los bytes y lo que dice el nombre. */
function veredicto(base, familia, formato, mime, motivo) {
  const sugerida = base.extension ? POR_EXTENSION[base.extension] ?? null : null
  const discrepancia = sugerida && sugerida !== familia
    ? `el archivo se llama .${base.extension} pero su contenido es ${formato}`
    : null
  return { ...base, familia, formato, mime, discrepancia, motivo }
}

/** Tamaño en unidades que una persona lee. Se usa en la respuesta al dueño. */
export function tamanoLegible(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.', ',')} kB`
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
