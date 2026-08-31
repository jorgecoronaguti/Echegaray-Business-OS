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

/** Alto de la firma en puntos. El hueco real del recibo entre la línea que corona el rótulo
 *  (y=42,5) y la línea que cierra el bloque por arriba (y=93,3) son 50,8 pt: con 34 la firma se lee
 *  entera y le sobra aire de los dos lados. Es un TOPE, no una medida fija — si el recuadro de un
 *  recibo fuera más bajo, `ubicacionDeLaFirma` la achica sola. */
export const ALTO_FIRMA = 34

/** Aire entre la firma y cada línea del recuadro. Una firma que muerde la línea que tiene abajo
 *  tapa el propio renglón que está firmando; el dueño lo marcó mirando el ejemplo. */
export const AIRE = 3

/** Sólo se usa cuando NO se pudo leer la línea (recibo sin trazos vectoriales): la línea corona el
 *  rótulo unos 7 pt más arriba, así que apoyarse ahí es el reemplazo más cercano. */
export const SOBRE_LA_LINEA = 10

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
 * Las dos líneas horizontales que encierran el espacio de firma: el RENGLÓN sobre el que se firma
 * (la que corona el rótulo) y el TECHO (la siguiente línea más arriba).
 *
 * Se leen del propio papel, no se estiman. Sin ellas la firma se apoyaría en el rótulo y taparía el
 * renglón —que es exactamente lo que hay que firmar, no borrar.
 *
 * @param {Array<{x1:number,y1:number,x2:number,y2:number}>} trazos  bounding boxes de los trazos
 * @param {{x:number,y:number,ancho:number}} rotulo
 * @returns {{renglon:number|null, techo:number|null}}
 */
export function lineasDelRecuadro(trazos = [], rotulo = null) {
  if (!rotulo) return { renglon: null, techo: null }
  const desde = rotulo.x; const hasta = rotulo.x + (rotulo.ancho || 0)
  const alturas = []
  for (const t of trazos ?? []) {
    if (!t) continue
    const y1 = Number(t.y1); const y2 = Number(t.y2)
    const x1 = Math.min(Number(t.x1), Number(t.x2)); const x2 = Math.max(Number(t.x1), Number(t.x2))
    if (![y1, y2, x1, x2].every(Number.isFinite)) continue
    if (Math.abs(y2 - y1) > 1) continue           // sólo horizontales
    if (x1 > desde || x2 < hasta) continue        // tiene que cruzar el rótulo entero
    const y = Math.min(y1, y2)
    if (y > rotulo.y) alturas.push(y)             // por encima del rótulo
  }
  alturas.sort((a, b) => a - b)
  return { renglon: alturas[0] ?? null, techo: alturas[1] ?? null }
}

/**
 * Dónde y de qué tamaño se dibuja la firma.
 *
 * La firma se APOYA SOBRE el renglón, nunca encima de él, y nunca toca el techo: si el hueco es más
 * chico que `altoFirma`, se achica. Sin líneas legibles cae al ancla vieja (el rótulo).
 *
 * @param {{x:number,y:number,ancho:number}} rotulo
 * @param {{ancho:number, alto:number}} imagen   dimensiones en píxeles (sólo importa la proporción)
 * @param {{altoFirma?:number, sobreLaLinea?:number, aire?:number, renglon?:number|null, techo?:number|null}} [o]
 * @returns {{x:number, y:number, ancho:number, alto:number}} en puntos, origen abajo-izquierda
 */
export function ubicacionDeLaFirma(rotulo, imagen, {
  altoFirma = ALTO_FIRMA, sobreLaLinea = SOBRE_LA_LINEA, aire = AIRE, renglon = null, techo = null,
} = {}) {
  if (!rotulo || !(imagen?.ancho > 0) || !(imagen?.alto > 0)) return null
  const proporcion = imagen.ancho / imagen.alto
  const y = Number.isFinite(renglon) && renglon !== null ? renglon + aire : rotulo.y + sobreLaLinea
  const hueco = Number.isFinite(techo) && techo !== null ? (techo - aire) - y : Infinity
  const alto = Math.max(1, Math.min(altoFirma, hueco))
  const ancho = alto * proporcion
  // Centrada sobre el rótulo: es donde el ojo espera la firma, y no depende del ancho del recuadro.
  const centro = rotulo.x + (rotulo.ancho / 2)
  return { x: centro - (ancho / 2), y, ancho, alto }
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
