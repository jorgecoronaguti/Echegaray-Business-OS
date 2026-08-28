// LA PUERTA ÚNICA POR LA QUE ENTRA UN ARCHIVO. Puro salvo el hash, que es local.
//
// ═══ POR QUÉ UNA CAPA Y NO UNA SKILL QUE SEPA DE TODO ═══
//
// «Me mandaron estos archivos para cotizar» llega como una carpeta con PDF, DWG, DXF, fotos de
// pizarrón, un Excel con el cómputo del cliente y un pliego en Word. Resolver eso con una sola
// pieza que sepa de todos los formatos produce un módulo que nadie puede tocar sin romper cuatro
// cosas. Acá cada formato tiene su ADAPTADOR detrás de la misma interfaz, y esta capa sólo decide
// CUÁL le toca a cada archivo y en qué estado quedó.
//
// ═══ EL ESTADO ES PARTE DEL DATO ═══
//
// Un archivo que no se pudo abrir no desaparece del inventario: queda con `NO_LEGIBLE` y el motivo.
// Un `.dwg` sin conversor queda `REQUIERE_CONVERSION` y dice qué falta. Esa lista es la respuesta a
// «¿leíste todo?», y sin ella la respuesta correcta sería «no sé».

import crypto from 'node:crypto'
import path from 'node:path'

/** Los formatos que este circuito reconoce. `OTRO` no es un error: es un archivo que existe y que
 *  todavía no sabemos leer, y eso hay que poder decirlo. */
export const FORMATO = Object.freeze({
  PDF: 'PDF', DWG: 'DWG', DXF: 'DXF', IMAGEN: 'IMAGEN', PLANILLA: 'PLANILLA',
  DOCUMENTO: 'DOCUMENTO', TEXTO: 'TEXTO', COMPRIMIDO: 'COMPRIMIDO', OTRO: 'OTRO',
})

/** En qué estado quedó el archivo después de intentar leerlo. */
export const ESTADO = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  LEIDO: 'LEIDO',
  REQUIERE_CONVERSION: 'REQUIERE_CONVERSION',
  NO_LEGIBLE: 'NO_LEGIBLE',
})

const POR_EXTENSION = Object.freeze({
  '.pdf': FORMATO.PDF,
  '.dwg': FORMATO.DWG,
  '.dxf': FORMATO.DXF,
  '.jpg': FORMATO.IMAGEN, '.jpeg': FORMATO.IMAGEN, '.png': FORMATO.IMAGEN, '.gif': FORMATO.IMAGEN,
  '.webp': FORMATO.IMAGEN, '.tif': FORMATO.IMAGEN, '.tiff': FORMATO.IMAGEN, '.bmp': FORMATO.IMAGEN, '.heic': FORMATO.IMAGEN,
  '.xls': FORMATO.PLANILLA, '.xlsx': FORMATO.PLANILLA, '.xlsm': FORMATO.PLANILLA, '.csv': FORMATO.PLANILLA, '.ods': FORMATO.PLANILLA,
  '.doc': FORMATO.DOCUMENTO, '.docx': FORMATO.DOCUMENTO, '.odt': FORMATO.DOCUMENTO, '.rtf': FORMATO.DOCUMENTO,
  '.txt': FORMATO.TEXTO, '.md': FORMATO.TEXTO,
  '.zip': FORMATO.COMPRIMIDO, '.rar': FORMATO.COMPRIMIDO, '.7z': FORMATO.COMPRIMIDO,
})

const POR_MIME = Object.freeze({
  'application/pdf': FORMATO.PDF,
  'image/vnd.dwg': FORMATO.DWG, 'application/acad': FORMATO.DWG, 'image/x-dwg': FORMATO.DWG,
  'image/vnd.dxf': FORMATO.DXF, 'application/dxf': FORMATO.DXF,
  'application/vnd.google-apps.spreadsheet': FORMATO.PLANILLA,
  'application/vnd.google-apps.document': FORMATO.DOCUMENTO,
})

/**
 * EL FORMATO DE UN ARCHIVO. PURA.
 *
 * La extensión manda sobre el MIME y no al revés, y no es un capricho: Drive devuelve
 * `application/octet-stream` para casi todo lo que no reconoce —incluidos los `.dwg`— y ese MIME no
 * dice nada. El nombre del archivo, en cambio, lo escribió alguien que sabía qué era.
 */
export function formatoDe({ nombre = '', mime = null } = {}) {
  const ext = path.extname(String(nombre)).toLowerCase()
  if (POR_EXTENSION[ext]) return POR_EXTENSION[ext]
  if (mime && POR_MIME[mime]) return POR_MIME[mime]
  if (mime && String(mime).startsWith('image/')) return FORMATO.IMAGEN
  if (mime && String(mime).startsWith('text/')) return FORMATO.TEXTO
  return FORMATO.OTRO
}

/** Qué adaptador le toca a cada formato, y qué puede sacar. Es el índice de la capa: agregar un
 *  formato es agregar una fila acá y un archivo al lado, no tocar el pipeline. */
export const ADAPTADOR = Object.freeze({
  [FORMATO.PDF]: { modulo: 'ingesta/pdf.mjs', saca: ['texto con coordenadas', 'geometría de trazos', 'clase vectorial/raster'], estado: ESTADO.PENDIENTE },
  [FORMATO.DXF]: { modulo: 'ingesta/dxf.mjs', saca: ['capas', 'longitudes', 'áreas', 'conteo de bloques', 'textos'], estado: ESTADO.PENDIENTE },
  // El DWG ya NO nace requiriendo intervención: `ingesta/dwg.mjs` lo convierte solo con el
  // conversor local y cachea el DXF por hash. `REQUIERE_CONVERSION` quedó para el caso en que ese
  // conversor no esté en la máquina, y eso se decide EN LA CORRIDA, no en esta tabla.
  [FORMATO.DWG]: { modulo: 'ingesta/dwg.mjs', saca: ['capas', 'longitudes', 'áreas', 'conteo de bloques', 'cotas acotadas', 'textos'], estado: ESTADO.PENDIENTE },
  [FORMATO.IMAGEN]: { modulo: 'comprobantes/vision.mjs', saca: ['interpretación visual'], estado: ESTADO.PENDIENTE },
  [FORMATO.PLANILLA]: { modulo: 'google.readExcel', saca: ['pestañas', 'filas'], estado: ESTADO.PENDIENTE },
  [FORMATO.DOCUMENTO]: { modulo: 'google.exportarComoTexto', saca: ['texto'], estado: ESTADO.PENDIENTE },
  [FORMATO.TEXTO]: { modulo: 'lectura directa', saca: ['texto'], estado: ESTADO.PENDIENTE },
  [FORMATO.COMPRIMIDO]: { modulo: null, saca: [], estado: ESTADO.NO_LEGIBLE },
  [FORMATO.OTRO]: { modulo: null, saca: [], estado: ESTADO.NO_LEGIBLE },
})

/** El hash del contenido. Es la llave del caché y la prueba de que dos archivos con nombre distinto
 *  son el mismo —cosa que en un data room de obra pasa todo el tiempo—. */
export const hashDe = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')

/**
 * REGISTRAR UN ARCHIVO. Devuelve la ficha con la que va a viajar por todo el circuito.
 *
 * `bytes` es opcional: cuando sólo se está inventariando una carpeta de Drive todavía no se
 * descargó nada, y el registro igual sirve —con `hash: null` dicho como tal, no como cadena vacía—.
 */
export function registrar({ nombre, ruta = null, mime = null, bytes = null, origen = null, proyecto = null, version = null, modificado = null } = {}) {
  const formato = formatoDe({ nombre, mime })
  const a = ADAPTADOR[formato]
  return {
    nombre: String(nombre ?? ''),
    ruta, mime, origen, proyecto, version, modificado,
    formato,
    hash: bytes ? hashDe(bytes) : null,
    bytes: bytes ? bytes.length : null,
    adaptador: a.modulo,
    puedeSacar: a.saca,
    estado: a.estado,
    porQue: a.estado === ESTADO.NO_LEGIBLE
      ? `no hay adaptador para ${formato}: el archivo queda en el inventario y declarado, no se ignora`
      : a.estado === ESTADO.REQUIERE_CONVERSION
        ? 'hace falta convertirlo antes de poder leerlo — ver ingesta/dwg.mjs'
        : null,
  }
}

/** El inventario de una carpeta entera, con el recuento por estado. Es la respuesta a «¿leíste
 *  todo?», y por eso lo que no se pudo leer sale primero. */
export function inventariar(archivos = []) {
  const fichas = archivos.map((a) => registrar(a))
  const porEstado = {}
  const porFormato = {}
  for (const f of fichas) {
    porEstado[f.estado] = (porEstado[f.estado] ?? 0) + 1
    porFormato[f.formato] = (porFormato[f.formato] ?? 0) + 1
  }
  return {
    total: fichas.length,
    porEstado,
    porFormato,
    fichas: fichas.sort((a, b) => (a.estado === ESTADO.PENDIENTE ? 1 : 0) - (b.estado === ESTADO.PENDIENTE ? 1 : 0) || a.nombre.localeCompare(b.nombre)),
    sinLeer: fichas.filter((f) => f.estado !== ESTADO.PENDIENTE && f.estado !== ESTADO.LEIDO),
  }
}
