// ENCONTRAR EL QR EN LA FOTO — el único paso que toca píxeles, y no usa ningún modelo.
//
// ═══ POR QUÉ NO ALCANZA CON PASARLE LA FOTO A jsQR ═══
//
// Medido sobre fotos reales del canal el 25/08/2026: la foto llega en 4096×3072 y el QR de AFIP
// ocupa alrededor del 2% del alto, en una esquina, con el papel torcido. jsQR sobre la imagen
// entera encontró 1 de 5. Recortando por zonas y probando escalas: 2 de 5.
//
// El resto son tickets angostos del corralón con el QR arrugado o cortado. Para ésos no hay lector
// que valga y sigue haciendo falta leer la foto — este módulo lo DICE devolviendo null, en vez de
// devolver algo dudoso.
//
// ═══ POR QUÉ SE PRUEBAN VARIAS ZONAS Y ESCALAS ═══
//
// jsQR ubica el patrón por sus tres cuadrados de esquina, y a 2% del cuadro esos cuadrados miden
// pocos píxeles. Recortar un noveno de la imagen hace que el QR ocupe ~18% y aparezca. Se prueban
// las nueve zonas porque la foto puede venir en cualquier orientación: el QR de AFIP se imprime
// abajo a la izquierda del comprobante, pero el comprobante puede estar de costado sobre la mesa.
//
// COSTO: es CPU, no red ni tokens. Sobre una foto de 12 Mpx son unas décimas de segundo, contra
// varios segundos y unos centavos de una llamada de visión.

import jpeg from 'jpeg-js'
import jsQR from 'jsqr'

/** Recorta una zona y la submuestrea. `paso` 2 toma un píxel de cada dos: más chico, más rápido. */
function zona(raw, x0, y0, ancho, alto, paso) {
  const W = Math.floor(ancho / paso)
  const H = Math.floor(alto / paso)
  const out = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const s = ((y0 + y * paso) * raw.width + (x0 + x * paso)) * 4
      const d = (y * W + x) * 4
      out[d] = raw.data[s]; out[d + 1] = raw.data[s + 1]; out[d + 2] = raw.data[s + 2]; out[d + 3] = 255
    }
  }
  return { data: out, width: W, height: H }
}

/** Las zonas a probar, de la más barata a la más cara: entera primero, después los nueve tercios. */
function* intentos(ancho, alto) {
  for (const p of [2, 1, 3]) yield [0, 0, ancho, alto, p]
  const tw = Math.floor(ancho / 3)
  const th = Math.floor(alto / 3)
  for (let fy = 0; fy < 3; fy++) {
    for (let fx = 0; fx < 3; fx++) {
      for (const p of [1, 2]) yield [fx * tw, fy * th, tw, th, p]
    }
  }
}

/**
 * EL TEXTO DEL QR DE UNA FOTO JPEG, o null si no hay ninguno legible.
 *
 * Null NO significa «esta foto no tiene QR»: significa «no lo pude leer». La diferencia importa —
 * quien llama tiene que caer a la lectura, no descartar el comprobante.
 *
 * @param buffer el JPEG crudo
 * @param topeMs corta la búsqueda: una foto ilegible no puede quedarse minutos probando zonas
 */
export function textoDeQrEnJpeg(buffer, { topeMs = 4000 } = {}) {
  let raw
  try {
    raw = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 2048 })
  } catch { return null } // no es un JPEG, o está roto: no es asunto de este módulo
  const hasta = Date.now() + topeMs
  for (const [x, y, w, h, p] of intentos(raw.width, raw.height)) {
    if (Date.now() > hasta) break
    try {
      const c = zona(raw, x, y, w, h, p)
      const r = jsQR(c.data, c.width, c.height)
      if (r?.data) return r.data
    } catch { /* zona inválida: se sigue */ }
  }
  return null
}

/** ¿Este adjunto es una imagen que este módulo puede mirar? Un PDF no: lleva otro camino. */
export const esJpeg = (mediaType) => /^image\/jpe?g$/i.test(String(mediaType ?? ''))
