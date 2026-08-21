// LOS LOGOS Y LA FIRMA SALEN DEL PDF QUE LA EMPRESA YA MANDA, NO DEL REPOSITORIO.
//
// Dos razones, y las dos importan. La primera: la firma de Rodrigo y el isotipo del cliente no
// tienen por qué vivir versionados en git — se leen del documento modelo cada vez que se genera
// uno nuevo. La segunda: si mañana cambia el logo, cambia el modelo y el generador lo sigue solo;
// un PNG copiado al repo se queda viejo sin avisar, que es el modo de fallar de todo activo
// duplicado.
//
// Las imágenes de estos PDF están en FlateDecode crudo (RGB de 8 bits, y una máscara en gris),
// así que alcanza con inflar y volver a empaquetar en PNG. No hace falta ninguna dependencia:
// un PNG es zlib más cuatro bloques con su CRC.
import zlib from 'node:zlib'

/** Los XObject de imagen del PDF, en orden de aparición, ya inflados. */
export function imagenesDe(pdf) {
  const s = pdf.toString('latin1')
  const re = /\/Subtype\s*\/Image([\s\S]{0,400}?)stream\r?\n/g
  const out = []
  let m
  while ((m = re.exec(s))) {
    const cab = m[1]
    const w = Number(/\/Width\s+(\d+)/.exec(cab)?.[1])
    const h = Number(/\/Height\s+(\d+)/.exec(cab)?.[1])
    const len = Number(/\/Length\s+(\d+)/.exec(cab)?.[1])
    if (!w || !h || !len) continue
    const gris = /\/DeviceGray/.test(cab)
    const inicio = m.index + m[0].length
    let datos
    try { datos = zlib.inflateSync(pdf.subarray(inicio, inicio + len)) } catch { continue }
    // Un tamaño que no coincide significa otro filtro (JPEG, CCITT) o un predictor: no se adivina.
    if (datos.length !== w * h * (gris ? 1 : 3)) continue
    out.push({ w, h, gris, datos })
  }
  return out
}

const TABLA_CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c }
  return t
})()
function crc32(buf) {
  let r = 0xFFFFFFFF
  for (const x of buf) r = TABLA_CRC[(r ^ x) & 0xFF] ^ (r >>> 8)
  return (r ^ 0xFFFFFFFF) >>> 0
}
function bloque(tipo, datos) {
  const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length)
  const td = Buffer.concat([Buffer.from(tipo, 'latin1'), datos])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([largo, td, crc])
}

/** PNG de 8 bits: 1 canal (gris), 3 (RGB) o 4 (RGBA). */
export function png(w, h, pixeles, canales) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = canales === 4 ? 6 : canales === 3 ? 2 : 0
  const paso = 1 + w * canales
  const filas = Buffer.alloc(h * paso)
  for (let y = 0; y < h; y++) {
    filas[y * paso] = 0 // filtro «ninguno»: el peso no importa acá y el código queda legible
    pixeles.copy(filas, y * paso + 1, y * w * canales, (y + 1) * w * canales)
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloque('IHDR', ihdr), bloque('IDAT', zlib.deflateSync(filas)), bloque('IEND', Buffer.alloc(0)),
  ])
}

/** Une una imagen RGB con su máscara de transparencia (SMask) en un PNG con canal alfa. */
export function conTransparencia(rgb, mascara) {
  const px = Buffer.alloc(rgb.w * rgb.h * 4)
  for (let p = 0; p < rgb.w * rgb.h; p++) {
    px[p * 4] = rgb.datos[p * 3]
    px[p * 4 + 1] = rgb.datos[p * 3 + 1]
    px[p * 4 + 2] = rgb.datos[p * 3 + 2]
    px[p * 4 + 3] = mascara.datos[p]
  }
  return png(rgb.w, rgb.h, px, 4)
}

export const dataUri = (buf) => `data:image/png;base64,${buf.toString('base64')}`
