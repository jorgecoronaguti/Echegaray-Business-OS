// LEER UN ZIP SIN AGREGAR UNA DEPENDENCIA. Puro salvo `zlib`, que viene con Node.
//
// ═══ POR QUÉ EXISTE ═══
//
// Un `.docx` no es un formato binario propietario: es un ZIP con `word/document.xml` adentro. Lo
// mismo un `.xlsx`, un `.odt` y un `.pptx`. Durante meses el circuito de conocimiento declaró «no
// hay adaptador de Word en el repo: no está la dependencia y no se agrega por un archivo» y dejó 46
// documentos sin leer —memorias descriptivas y el contrato de QUATTROPANI incluidos— por una
// dependencia que nunca hizo falta: `zlib.inflateRawSync` es exactamente el algoritmo con el que un
// ZIP comprime.
//
// ═══ SE LEE EL DIRECTORIO CENTRAL, NO EL PRINCIPIO DEL ARCHIVO ═══
//
// Recorrer los local headers de adelante para atrás parece más simple y está mal: cuando el archivo
// se escribió en streaming los tamaños del local header vienen en CERO y los reales están en un
// descriptor DESPUÉS de los datos, al que sólo se llega sabiendo dónde terminan. El directorio
// central —que es lo que el ZIP tiene al final justamente para esto— trae los tamaños siempre.
//
// ═══ NO DESCOMPRIME A CIEGAS ═══
//
// Un ZIP que llega de afuera puede traer nombres con `../`, entradas gigantes que no comprimen nada
// (bomba de descompresión) o métodos que este lector no conoce. Los tres se rechazan CON MOTIVO en
// vez de explotar o de escribir fuera de lugar: nada de esto toca el disco, pero el motivo es lo
// que después aparece en el informe de «qué no se pudo leer».
import zlib from 'node:zlib'

/** Las firmas del formato. Son constantes del ZIP, no elecciones nuestras. */
const FIRMA = Object.freeze({ EOCD: 0x06054b50, CD: 0x02014b50, LOCAL: 0x04034b50, EOCD64_LOC: 0x07064b50, EOCD64: 0x06064b50 })

/** Los dos únicos métodos que este lector abre. El resto se declara, no se adivina. */
export const METODO = Object.freeze({ CRUDO: 0, DEFLATE: 8 })

/** Tope de expansión de UNA entrada. Un `document.xml` de un informe con fotos infla ~20×; 200 MB
 *  desde un archivo de 30 MB no es un documento, es una bomba. */
export const MAX_SALIDA = 256 * 1024 * 1024

/** El comentario final puede tener hasta 65.535 bytes, así que el EOCD nunca está más atrás que
 *  eso más su propio encabezado. Buscar en todo el archivo sería recorrer 30 MB por gusto. */
const VENTANA_EOCD = 22 + 0xffff

/** Dónde arranca el End Of Central Directory. `-1` si el archivo no es un ZIP. PURA. */
export function finDelDirectorio(b) {
  const desde = Math.max(0, b.length - VENTANA_EOCD)
  for (let i = b.length - 22; i >= desde; i--) if (b.readUInt32LE(i) === FIRMA.EOCD) return i
  return -1
}

/** ¿Los primeros bytes son los de un ZIP? Se mira el CONTENIDO y no la extensión: en este data room
 *  hay `.doc` que son `.docx` renombrados y al revés. PURA. */
export const pareceZip = (b) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07)

/**
 * EL ÍNDICE DEL ZIP: una ficha por entrada, sin descomprimir nada todavía.
 *
 * Devuelve `{ ok, entradas }` o `{ ok: false, porQue }`. Nunca tira: quien llama necesita el motivo
 * para poder reportarlo, y una excepción a mitad de una tanda de 46 archivos se lleva puesta la
 * tanda entera.
 */
export function indice(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  if (!pareceZip(b)) return { ok: false, porQue: `no empieza con la firma «PK» de un ZIP: los primeros bytes son ${[...b.subarray(0, 4)].map((x) => x.toString(16).padStart(2, '0')).join(' ')}` }
  const e = finDelDirectorio(b)
  if (e < 0) return { ok: false, porQue: 'el archivo empieza como un ZIP pero no tiene directorio central: está truncado o partido en volúmenes' }
  // ZIP64 se DECLARA en vez de leerse mal: el campo de 16 bits dice 0xffff y el número real vive en
  // otra estructura. Un lector que ignora eso devuelve 65.535 entradas que no existen.
  const cuantas = b.readUInt16LE(e + 10)
  let arranque = b.readUInt32LE(e + 16)
  if (cuantas === 0xffff || arranque === 0xffffffff) return { ok: false, porQue: 'es un ZIP64 y este lector sólo abre el formato clásico: haría falta leer el EOCD64' }
  const entradas = []
  let p = arranque
  for (let k = 0; k < cuantas; k++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== FIRMA.CD) return { ok: false, porQue: `el directorio central se corta en la entrada ${k + 1} de ${cuantas}: el archivo está dañado` }
    const ln = b.readUInt16LE(p + 28)
    const le = b.readUInt16LE(p + 30)
    const lc = b.readUInt16LE(p + 32)
    entradas.push({
      nombre: b.toString('utf8', p + 46, p + 46 + ln),
      metodo: b.readUInt16LE(p + 10),
      comprimido: b.readUInt32LE(p + 20),
      original: b.readUInt32LE(p + 24),
      local: b.readUInt32LE(p + 42),
    })
    p += 46 + ln + le + lc
  }
  return { ok: true, entradas }
}

/** Un nombre de entrada seguro: nada de rutas absolutas ni de `..`. PURA. */
export const nombreSeguro = (n) => !/^([a-zA-Z]:)?[/\\]/.test(String(n)) && !String(n).split(/[/\\]/).includes('..')

/**
 * EL CONTENIDO DE UNA ENTRADA. Devuelve `{ ok, datos }` o `{ ok: false, porQue }`.
 *
 * `original` del directorio central es lo que decide el tope: se rechaza ANTES de inflar, porque
 * inflar para después medir es exactamente lo que hace una bomba de descompresión.
 */
export function contenido(bytes, entrada, { maxSalida = MAX_SALIDA } = {}) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  if (!nombreSeguro(entrada.nombre)) return { ok: false, porQue: `la entrada «${entrada.nombre}» sale de su propia carpeta: no se abre` }
  if (entrada.original > maxSalida) return { ok: false, porQue: `la entrada «${entrada.nombre}» declara ${entrada.original} bytes descomprimidos y el tope es ${maxSalida}` }
  const p = entrada.local
  if (p + 30 > b.length || b.readUInt32LE(p) !== FIRMA.LOCAL) return { ok: false, porQue: `el encabezado local de «${entrada.nombre}» no está donde el directorio dice` }
  const ini = p + 30 + b.readUInt16LE(p + 26) + b.readUInt16LE(p + 28)
  const crudo = b.subarray(ini, ini + entrada.comprimido)
  if (crudo.length < entrada.comprimido) return { ok: false, porQue: `«${entrada.nombre}» está truncado: faltan ${entrada.comprimido - crudo.length} bytes` }
  if (entrada.metodo === METODO.CRUDO) return { ok: true, datos: Buffer.from(crudo) }
  if (entrada.metodo !== METODO.DEFLATE) return { ok: false, porQue: `«${entrada.nombre}» usa el método de compresión ${entrada.metodo} y este lector sólo abre 0 (crudo) y 8 (deflate)` }
  try { return { ok: true, datos: zlib.inflateRawSync(crudo, { maxOutputLength: maxSalida }) } } catch (err) {
    return { ok: false, porQue: `«${entrada.nombre}» no se pudo descomprimir: ${String(err?.message ?? err).slice(0, 120)}` }
  }
}

/** El texto UTF-8 de UNA entrada por nombre exacto. El atajo que usan los lectores de OOXML. */
export function textoDe(bytes, nombre, opciones = {}) {
  const ix = indice(bytes)
  if (!ix.ok) return ix
  const e = ix.entradas.find((x) => x.nombre === nombre)
  if (!e) return { ok: false, porQue: `el ZIP no tiene «${nombre}» (tiene ${ix.entradas.length} entrada(s))` }
  const c = contenido(bytes, e, opciones)
  return c.ok ? { ok: true, texto: c.datos.toString('utf8') } : c
}
