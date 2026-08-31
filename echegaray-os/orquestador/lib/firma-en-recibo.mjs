// DÓNDE VA LA FIRMA DEL EMPLEADOR EN UN RECIBO — núcleo puro, sin PDF y sin red.
//
// ═══ POR QUÉ SE UBICA POR TEXTO Y NO POR COORDENADA ═══
//
// La tentación es medir el recuadro una vez en un recibo y usar esos números para todos: son todos
// del mismo estudio y del mismo template. Funciona hasta que el estudio mueve una fila —y el día que
// la mueva, la firma del empleador aparece pisando un importe, en un documento con efecto laboral.
//
// El rótulo «FIRMA DEL EMPLEADOR» está impreso en el propio recibo y `pdfjs` devuelve su posición
// exacta. Se ancla ahí: la firma va CENTRADA sobre ese rótulo y APOYADA en la línea que lo corona.
// Si el rótulo no está, no hay dónde firmar y se devuelve FALTA_DATO. Nunca se estima una posición.
//
// ═══ Y POR QUÉ NO SE FIRMA DOS VECES ═══
//
// Sellar es idempotente por decisión: el llamador pregunta `yaFirmado` antes de escribir. Una firma
// encima de otra se ve como un borrón y obliga a rehacer el PDF desde el original, que puede no
// existir más.

/** Alto de la firma en puntos. Medido contra el recuadro real del recibo: la caja tiene ~46 pt de
 *  alto útil entre la línea y el borde superior, y 30 deja aire arriba y abajo sin tocar el marco. */
export const ALTO_FIRMA = 46

/** Cuánto se levanta la firma por encima de la línea del rótulo. La línea corona el rótulo unos
 *  5 pt más arriba; apoyarla justo ahí es como se firma un papel. */
export const SOBRE_LA_LINEA = 6

export const MOTIVO = Object.freeze({
  SIN_ROTULO: 'FALTA_DATO: el recibo no dice «FIRMA DEL EMPLEADOR», no hay dónde firmar',
  YA_FIRMADA: 'ya estaba firmada: no se vuelve a sellar',
})

/**
 * El rótulo del empleador entre los items de texto de una página.
 *
 * EXIGE LA «R» FINAL. «FIRMA DEL EMPLEADO» y «FIRMA DEL EMPLEADOR» conviven en el mismo renglón del
 * recibo, a 190 pt de distancia. Un `includes('FIRMA DEL EMPLEADO')` engancha el del trabajador y
 * estampa la firma del empleador sobre la línea que tiene que firmar la persona. Es el mismo defecto
 * que «empleador empieza con empleado» que este repo ya pagó leyendo constancias de ARCA.
 *
 * @param {Array<{str:string, transform:number[], width:number, height:number}>} items
 */
export function rotuloDelEmpleador(items = []) {
  const re = /FIRMA\s+DEL\s+EMPLEADOR\b/i
  for (const it of items ?? []) {
    if (!it || typeof it.str !== 'string' || !re.test(it.str)) continue
    const t = it.transform
    if (!Array.isArray(t) || t.length < 6) continue
    const x = Number(t[4]); const y = Number(t[5])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    return { x, y, ancho: Number(it.width) || 0, alto: Number(it.height) || 0 }
  }
  return null
}

/**
 * Dónde y de qué tamaño se dibuja la firma, dado el rótulo y la proporción de la imagen.
 *
 * @param {{x:number,y:number,ancho:number}} rotulo
 * @param {{ancho:number, alto:number}} imagen   dimensiones en píxeles (sólo importa la proporción)
 * @param {{altoFirma?:number, sobreLaLinea?:number}} [o]
 * @returns {{x:number, y:number, ancho:number, alto:number}} en puntos, origen abajo-izquierda
 */
export function ubicacionDeLaFirma(rotulo, imagen, { altoFirma = ALTO_FIRMA, sobreLaLinea = SOBRE_LA_LINEA } = {}) {
  if (!rotulo || !(imagen?.ancho > 0) || !(imagen?.alto > 0)) return null
  const proporcion = imagen.ancho / imagen.alto
  const alto = altoFirma
  const ancho = alto * proporcion
  // Centrada sobre el rótulo: es donde el ojo espera la firma, y no depende del ancho del recuadro.
  const centro = rotulo.x + (rotulo.ancho / 2)
  return { x: centro - (ancho / 2), y: rotulo.y + sobreLaLinea, ancho, alto }
}

/**
 * ¿Esta página ya tiene la firma puesta?
 *
 * Se decide por una MARCA que este mismo sellador deja, no por mirar píxeles: mirar la imagen
 * obligaría a comparar mapas de bits y un recibo escaneado daría falso negativo todas las veces.
 * La marca va en el texto del PDF, invisible para el lector y legible para el próximo sellado.
 */
export const MARCA = 'ECSAS-FIRMA-EMPLEADOR-v1'

export function yaFirmado(textoDeLaPagina = '') {
  return String(textoDeLaPagina ?? '').includes(MARCA)
}
