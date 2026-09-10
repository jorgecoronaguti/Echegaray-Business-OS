// EDITAR UN .xlsx SIN REESCRIBIRLO. Puro salvo `zlib`, que viene con Node.
//
// ═══ POR QUÉ EXISTE ═══
//
// El archivo que el dueño sube al banco tiene que ser INDISTINGUIBLE del que Santander ya aceptó.
// Abrirlo con una librería de planillas y volver a guardarlo NO cumple eso: medido el 10/09/2026
// sobre el lote de Fondo de Cese que el banco debitó el 18/08, SheetJS devolvió un archivo al que
// le faltaban las cinco imágenes (`xl/media/image1..5.png`), los cinco `xl/drawings/drawing*.xml`,
// `docProps/custom.xml` y las cinco reglas de validación de datos de la hoja Pagos — y le sobraba
// un `xl/metadata.xml` que el original no tenía. El archivo «se veía bien» y era otro archivo.
//
// Acá el .xlsx se trata como lo que es: un ZIP. Se cambia UNA entrada y el resto se copia con sus
// bytes comprimidos ORIGINALES, sin descomprimir ni recomprimir. Todo lo que no se tocó queda
// idéntico byte a byte, incluidos su CRC, su fecha y su método de compresión.
//
// ═══ LO QUE ESTE MÓDULO NO HACE ═══
//
// No agrega ni quita entradas, no reordena, no toca el prólogo del archivo. Si algún día hace
// falta, se escribe con la misma disciplina: acá el default es NO tocar.

import zlib from 'node:zlib'

const FIRMA = Object.freeze({ LOCAL: 0x04034b50, CD: 0x02014b50, EOCD: 0x06054b50 })
const DEFLATE = 8

/** El EOCD está al final, pero puede haber hasta 64 KB de comentario después. Se busca hacia atrás. */
function finDelDirectorio(b) {
  for (let p = b.length - 22; p >= 0 && p >= b.length - 22 - 0xffff; p--) {
    if (b.readUInt32LE(p) === FIRMA.EOCD) return p
  }
  return -1
}

/**
 * Todas las entradas del ZIP con TODOS los campos del directorio central.
 *
 * `indice()` de `ingesta/zip.mjs` alcanza para leer; para volver a escribir hacen falta también la
 * fecha, los flags y los atributos externos: reconstruirlos con valores «razonables» cambia el
 * archivo en lugares que nadie mira hasta que un parser ajeno se queja.
 */
export function entradasDe(bytes) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  const e = finDelDirectorio(b)
  if (e < 0) throw new Error('el archivo no tiene directorio central: no es un ZIP clásico')
  const cuantas = b.readUInt16LE(e + 10)
  if (cuantas === 0xffff || b.readUInt32LE(e + 16) === 0xffffffff) {
    throw new Error('es un ZIP64 y este editor sólo trabaja con el formato clásico')
  }
  const entradas = []
  let p = b.readUInt32LE(e + 16)
  for (let k = 0; k < cuantas; k++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== FIRMA.CD) {
      throw new Error(`el directorio central se corta en la entrada ${k + 1} de ${cuantas}`)
    }
    const ln = b.readUInt16LE(p + 28), le = b.readUInt16LE(p + 30), lc = b.readUInt16LE(p + 32)
    const local = b.readUInt32LE(p + 42)
    const lnL = b.readUInt16LE(local + 26), leL = b.readUInt16LE(local + 28)
    const ini = local + 30 + lnL + leL
    const comprimido = b.readUInt32LE(p + 20)
    entradas.push({
      nombre: b.toString('utf8', p + 46, p + 46 + ln),
      versionMadeBy: b.readUInt16LE(p + 4),
      versionNeeded: b.readUInt16LE(p + 6),
      flags: b.readUInt16LE(p + 8),
      metodo: b.readUInt16LE(p + 10),
      hora: b.readUInt16LE(p + 12),
      fecha: b.readUInt16LE(p + 14),
      crc: b.readUInt32LE(p + 16),
      original: b.readUInt32LE(p + 24),
      extraCD: Buffer.from(b.subarray(p + 46 + ln, p + 46 + ln + le)),
      extraLocal: Buffer.from(b.subarray(local + 30 + lnL, ini)),
      atributosInternos: b.readUInt16LE(p + 36),
      atributosExternos: b.readUInt32LE(p + 38),
      // Los bytes YA COMPRIMIDOS. Es lo que hace que copiar sea copiar y no volver a comprimir.
      datosCrudos: Buffer.from(b.subarray(ini, ini + comprimido)),
    })
    p += 46 + ln + le + lc
  }
  return entradas
}

/** El contenido descomprimido de una entrada, por nombre exacto. */
export function contenidoDe(entradas, nombre) {
  const e = entradas.find((x) => x.nombre === nombre)
  if (!e) throw new Error(`el archivo no tiene la entrada «${nombre}»`)
  if (e.metodo === 0) return Buffer.from(e.datosCrudos)
  if (e.metodo !== DEFLATE) throw new Error(`«${nombre}» usa el método ${e.metodo}, que este editor no abre`)
  return zlib.inflateRawSync(e.datosCrudos)
}

/**
 * Devuelve una lista de entradas igual a la recibida pero con UNA reemplazada.
 *
 * La nueva se comprime con deflate; las demás conservan sus bytes crudos. El nombre tiene que
 * existir: agregar una entrada nueva sería cambiar la forma del archivo, y eso no es lo que este
 * módulo promete.
 */
export function reemplazarEntrada(entradas, nombre, datos) {
  const i = entradas.findIndex((x) => x.nombre === nombre)
  if (i < 0) throw new Error(`no se puede reemplazar «${nombre}»: no existe en el archivo`)
  const buf = Buffer.isBuffer(datos) ? datos : Buffer.from(datos, 'utf8')
  const nueva = {
    ...entradas[i],
    metodo: DEFLATE,
    crc: zlib.crc32(buf) >>> 0,
    original: buf.length,
    datosCrudos: zlib.deflateRawSync(buf, { level: 9 }),
  }
  return entradas.map((e, k) => (k === i ? nueva : e))
}

/** Vuelve a armar el ZIP en el mismo orden, con local headers y directorio central coherentes. */
export function escribirZip(entradas) {
  const partes = []
  const central = []
  let desplazamiento = 0
  for (const e of entradas) {
    const nombre = Buffer.from(e.nombre, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(FIRMA.LOCAL, 0)
    local.writeUInt16LE(e.versionNeeded, 4)
    local.writeUInt16LE(e.flags, 6)
    local.writeUInt16LE(e.metodo, 8)
    local.writeUInt16LE(e.hora, 10)
    local.writeUInt16LE(e.fecha, 12)
    local.writeUInt32LE(e.crc, 14)
    local.writeUInt32LE(e.datosCrudos.length, 18)
    local.writeUInt32LE(e.original, 22)
    local.writeUInt16LE(nombre.length, 26)
    local.writeUInt16LE(e.extraLocal.length, 28)
    partes.push(local, nombre, e.extraLocal, e.datosCrudos)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(FIRMA.CD, 0)
    cd.writeUInt16LE(e.versionMadeBy, 4)
    cd.writeUInt16LE(e.versionNeeded, 6)
    cd.writeUInt16LE(e.flags, 8)
    cd.writeUInt16LE(e.metodo, 10)
    cd.writeUInt16LE(e.hora, 12)
    cd.writeUInt16LE(e.fecha, 14)
    cd.writeUInt32LE(e.crc, 16)
    cd.writeUInt32LE(e.datosCrudos.length, 20)
    cd.writeUInt32LE(e.original, 24)
    cd.writeUInt16LE(nombre.length, 28)
    cd.writeUInt16LE(e.extraCD.length, 30)
    cd.writeUInt16LE(0, 32)
    cd.writeUInt16LE(0, 34)
    cd.writeUInt16LE(e.atributosInternos, 36)
    cd.writeUInt32LE(e.atributosExternos, 38)
    cd.writeUInt32LE(desplazamiento, 42)
    central.push(cd, nombre, e.extraCD)

    desplazamiento += 30 + nombre.length + e.extraLocal.length + e.datosCrudos.length
  }
  const cuerpo = Buffer.concat(partes)
  const dir = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(FIRMA.EOCD, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entradas.length, 8)
  eocd.writeUInt16LE(entradas.length, 10)
  eocd.writeUInt32LE(dir.length, 12)
  eocd.writeUInt32LE(cuerpo.length, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([cuerpo, dir, eocd])
}

/** El atajo: cambiar una entrada de un .xlsx y devolver el archivo nuevo. */
export function editarXlsx(bytes, nombre, datos) {
  return escribirZip(reemplazarEntrada(entradasDe(bytes), nombre, datos))
}
