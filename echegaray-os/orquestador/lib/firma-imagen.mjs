// PREPARAR UNA FIRMA ESCANEADA PARA ESTAMPARLA — núcleo puro, sin red y sin dependencias.
//
// ═══ POR QUÉ ═══
//
// Una firma escaneada llega como un rectángulo blanco con trazo negro. Estamparla tal cual pone un
// RECUADRO BLANCO OPACO sobre el recibo: el 90% de los píxeles de la firma del apoderado eran blanco
// opaco. Adentro de un recuadro vacío casi no se nota; encima de una línea, la borra. Y el mismo papel
// que este OS firma es el que mira un inspector.
//
// Además el escaneo trae margen: en la firma del apoderado, el trazo ocupaba el 76% del alto y el resto
// era papel. Como la altura del sello la fija el hueco del recibo, ese margen se come la legibilidad
// —la firma se dibuja más chica de lo que el recuadro permite— sin aportar nada.
//
// Las dos cosas se arreglan acá, una sola vez, sobre el archivo: el fondo se vuelve transparente y el
// margen se recorta. El sellador no sabe de esto y no tiene que saber.
//
// ═══ POR QUÉ ALFA PROPORCIONAL Y NO UN UMBRAL ═══
//
// Un umbral ("más claro que X → transparente") deja el borde del trazo dentado: el antialiasing del
// escáner es justamente esa banda gris. Se usa la LUMINANCIA como opacidad —blanco = invisible, negro =
// sólido— así que el degradado del borde se conserva y la firma no queda con escalones.

/** Luminancia perceptual de un píxel (0 negro … 255 blanco). */
export function luminancia(r, g, b) {
  return (0.2126 * r) + (0.7152 * g) + (0.0722 * b)
}

/**
 * Fondo blanco → transparente, con opacidad proporcional a la tinta.
 *
 * Devuelve un buffer RGBA nuevo: el color se lleva a negro puro y la opacidad sale de cuán oscuro era
 * el píxel. Un píxel que ya venía transparente se respeta (se multiplica su alfa).
 *
 * @param {Uint8Array|Buffer} rgba  píxeles RGBA sin filtrar
 * @param {{tinta?:number}} [o]  `tinta`: por debajo de esta luminancia el trazo es 100% opaco
 */
export function fondoATransparente(rgba, { tinta = 60 } = {}) {
  const out = new Uint8Array(rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    const lum = luminancia(rgba[i], rgba[i + 1], rgba[i + 2])
    // 255 en el negro pleno, 0 en el blanco, lineal en el medio: eso conserva el antialiasing.
    let alfa = Math.round(255 - lum)
    if (lum <= tinta) alfa = 255
    out[i] = 0; out[i + 1] = 0; out[i + 2] = 0
    out[i + 3] = Math.round((alfa * (rgba[i + 3] ?? 255)) / 255)
  }
  return out
}

/**
 * La caja que contiene toda la tinta. Devuelve `null` si la imagen está vacía —y devolver null importa:
 * recortar a una caja inventada estamparía un rectángulo transparente y NADIE lo vería fallar.
 *
 * @param {Uint8Array|Buffer} rgba
 * @param {number} ancho
 * @param {number} alto
 * @param {{minAlfa?:number}} [o]
 */
export function cajaDeLaTinta(rgba, ancho, alto, { minAlfa = 16 } = {}) {
  let x1 = ancho, y1 = alto, x2 = -1, y2 = -1
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (rgba[((y * ancho) + x) * 4 + 3] < minAlfa) continue
      if (x < x1) x1 = x
      if (x > x2) x2 = x
      if (y < y1) y1 = y
      if (y > y2) y2 = y
    }
  }
  if (x2 < 0) return null
  return { x: x1, y: y1, ancho: (x2 - x1) + 1, alto: (y2 - y1) + 1 }
}

/** Recorta un RGBA a una caja. Puro. */
export function recortar(rgba, ancho, caja) {
  const out = new Uint8Array(caja.ancho * caja.alto * 4)
  for (let y = 0; y < caja.alto; y++) {
    const src = (((caja.y + y) * ancho) + caja.x) * 4
    out.set(rgba.subarray(src, src + (caja.ancho * 4)), y * caja.ancho * 4)
  }
  return out
}
