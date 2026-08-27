// CONTROL DE CALIDAD DE LA IMAGEN QUE VOLVIÓ. Barato, determinístico y sin modelo.
//
// No juzga si la imagen es linda —eso no se puede medir— sino lo que sí se puede: que los bytes
// SEAN una imagen, que pesen algo razonable y que la forma sea la que se pidió. Un proveedor que
// devuelve 200 con un PNG de 300 bytes, o que ignora el `aspectRatio` y manda un cuadrado donde se
// pidió 16:9, hoy pasaría como éxito y la lámina saldría deformada.
//
// PURO: recibe el buffer, no lo baja ni lo guarda. Se testea entero.

/** Firma de los formatos que aceptamos. `createImage` de Slides sólo baja PNG, JPEG y GIF. */
const FIRMAS = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
]

/** El formato REAL de los bytes, no el que declara el proveedor. `null` si no es una imagen. PURA. */
export function formatoReal(buf) {
  for (const f of FIRMAS) {
    if (buf.length >= f.bytes.length && f.bytes.every((b, i) => buf[i] === b)) return f.mime
  }
  return null
}

/** Ancho y alto de un PNG (IHDR, offset fijo 16). `null` para otros formatos: medir un JPEG exige
 *  recorrer sus marcadores y no vale la pena — el proveedor principal devuelve PNG. PURA. */
export function medidasPng(buf) {
  if (formatoReal(buf) !== 'image/png' || buf.length < 24) return null
  return { ancho: buf.readUInt32BE(16), alto: buf.readUInt32BE(20) }
}

/** `16:9` → 1.777… PURA. */
export function razonDe(aspecto) {
  const [a, b] = String(aspecto).split(':').map(Number)
  return a > 0 && b > 0 ? a / b : null
}

/** Tope de Slides para una imagen insertada por URL: 50 MB y 25 megapíxeles. */
export const TOPE_BYTES = 50 * 1024 * 1024
const PISO_BYTES = 4 * 1024

/**
 * `{ok, formato, medidas, hallazgos:[...]}`. `ok:false` cuando algo impide USAR la imagen; un
 * aspecto desviado es hallazgo pero no bloquea: la imagen sirve igual y quien la use decide. PURA.
 */
export function revisar({ buffer, aspectoPedido = null } = {}) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? [])
  const hallazgos = []
  const formato = formatoReal(buf)
  if (!formato) return { ok: false, formato: null, medidas: null, hallazgos: ['los bytes que devolvió el proveedor no son una imagen PNG, JPEG ni GIF'] }
  if (buf.length < PISO_BYTES) return { ok: false, formato, medidas: null, hallazgos: [`la imagen pesa ${buf.length} bytes: es una imagen vacía o truncada`] }
  if (buf.length > TOPE_BYTES) hallazgos.push(`pesa ${(buf.length / 1024 / 1024).toFixed(1)} MB: Google Slides no baja imágenes de más de 50 MB`)

  const medidas = medidasPng(buf)
  if (medidas) {
    if (medidas.ancho * medidas.alto > 25_000_000) hallazgos.push('supera los 25 megapíxeles que admite Google Slides')
    const esperado = razonDe(aspectoPedido)
    if (esperado) {
      const real = medidas.ancho / medidas.alto
      // 4% de tolerancia: los proveedores redondean a múltiplos de 8 o 64 píxeles.
      if (Math.abs(real - esperado) / esperado > 0.04) {
        hallazgos.push(`se pidió ${aspectoPedido} y volvió ${medidas.ancho}×${medidas.alto}: el proveedor no respetó la relación de aspecto`)
      }
    }
  }
  return { ok: true, formato, medidas, hallazgos }
}
