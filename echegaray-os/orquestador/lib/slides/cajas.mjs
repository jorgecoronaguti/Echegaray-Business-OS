// LAS PIEZAS CON LAS QUE SE DIBUJA UNA LÁMINA, Y EL MARCO QUE COMPARTEN TODAS.
//
// Una «caja» es geometría + contenido, sin una sola llamada a la API. Ese es el punto: la lámina
// se puede componer, medir y auditar entera sin credenciales de Google, y `requests.mjs` la
// traduce después. Todo el control de calidad trabaja sobre cajas, no sobre lo que Google devolvió
// — porque cuando Google devuelve, la presentación ya existe y el defecto ya se publicó.
//
// PURO.

import { COLOR, CONTENIDO, LOGO, LOGO_URL, MARGEN, ORIGEN, PAGINA, TIPO } from './marca.mjs'
import { medirTexto } from './layout.mjs'

let contador = 0
/** Ids estables dentro de una composición: `reiniciarIds()` antes de cada deck. */
export function reiniciarIds() { contador = 0 }
const nuevoId = (p) => `${p}_${(contador += 1)}`

/** Rectángulo (fondo, tarjeta, barra). `capa:'fondo'` lo excluye del control de superposición:
 *  un texto ARRIBA de su tarjeta no es un defecto, es el diseño. */
export function rect({ x, y, ancho, alto, relleno = null, borde = null, capa = 'fondo', forma = 'RECTANGLE' }) {
  return { id: nuevoId('r'), tipo: 'rect', forma, x, y, ancho, alto, relleno, borde, capa }
}

/** Caja de texto. `estilo` sale SIEMPRE de `TIPO` en marca.mjs: acá no se inventan tamaños. */
export function texto({ x, y, ancho, alto, contenido, estilo, alineacion = 'START', valign = 'TOP', capa = 'contenido' }) {
  return {
    id: nuevoId('t'), tipo: 'texto', x, y, ancho, alto, capa,
    contenido: String(contenido ?? ''), estilo, alineacion, valign,
  }
}

/** Lista de puntos. El bullet lo dibuja Slides (createParagraphBullets), no un guion escrito a mano:
 *  un «- » al principio del texto no es una lista, es un texto que empieza con guion. */
export function bullets({ x, y, ancho, alto, items, estilo, capa = 'contenido' }) {
  return { id: nuevoId('b'), tipo: 'bullets', x, y, ancho, alto, items: items.map((i) => String(i)), estilo, capa }
}

/** Línea de 1 pt o menos: separadores y reglas. Va como rectángulo fino, que la API dibuja igual y
 *  permite darle el mismo tratamiento de color. */
export function regla({ x, y, ancho, grosor = 0.75, color = COLOR.linea }) {
  return rect({ x, y, ancho, alto: grosor, relleno: color, capa: 'fondo' })
}

export function imagen({ x, y, ancho, alto, url, capa = 'fondo' }) {
  return { id: nuevoId('i'), tipo: 'imagen', x, y, ancho, alto, url, capa }
}

export function tabla({ x, y, ancho, alto, columnas, filas, anchoColumnas, alinearDerecha = [] }) {
  return { id: nuevoId('tb'), tipo: 'tabla', x, y, ancho, alto, columnas, filas, anchoColumnas, alinearDerecha, capa: 'contenido' }
}

// ── El marco común de las láminas de contenido ──────────────────────────────────────────────
// Kicker · título · regla amarilla · pie con línea, identidad, obra y número. Es lo que hace que
// veinte láminas se lean como un documento y no como veinte imágenes.

export const CHROME = Object.freeze({
  kickerY: MARGEN.sup,
  tituloY: MARGEN.sup + 14,
  reglaAncho: 46,
  reglaGrosor: 3,
  pieLinea: PAGINA.alto - MARGEN.inf + 12,
  pieTexto: PAGINA.alto - MARGEN.inf + 18,
})

/**
 * Encabezado: devuelve `{cajas, y}` — `y` es donde puede empezar el cuerpo. El título se mide de
 * verdad: un título de dos líneas empuja el cuerpo, no lo pisa.
 */
export function encabezado({ kicker = null, titulo, ancho = CONTENIDO.ancho, x = CONTENIDO.x }) {
  const cajas = []
  let y = CHROME.kickerY
  if (kicker) {
    cajas.push(texto({ x, y, ancho, alto: 12, contenido: kicker.toUpperCase(), estilo: TIPO.kicker }))
    y += 15
  } else { y = CHROME.tituloY }
  const m = medirTexto(titulo, { ancho, tamano: TIPO.titulo.tamano, alto: TIPO.titulo.alto })
  cajas.push(texto({ x, y, ancho, alto: m.altoPt + 4, contenido: titulo, estilo: TIPO.titulo }))
  y += m.altoPt + 10
  cajas.push(rect({ x, y, ancho: CHROME.reglaAncho, alto: CHROME.reglaGrosor, relleno: COLOR.amarillo }))
  return { cajas, y: y + CHROME.reglaGrosor + 18 }
}

/** Pie: línea, identidad + obra a la izquierda, número de lámina a la derecha, logo si hay URL. */
export function pie({ numero, total, obra = null, cliente = null, conLogo = true }) {
  const izquierda = ['ECHEGARAY CONSTRUCCIONES', obra, cliente].filter(Boolean).join('  ·  ')
  const cajas = [
    regla({ x: CONTENIDO.x, y: CHROME.pieLinea, ancho: CONTENIDO.ancho }),
    texto({ x: CONTENIDO.x, y: CHROME.pieTexto, ancho: CONTENIDO.ancho - 120, contenido: izquierda, estilo: TIPO.pie }),
    texto({
      x: CONTENIDO.x + CONTENIDO.ancho - 60, y: CHROME.pieTexto, ancho: 60, alto: 12,
      contenido: `${numero} / ${total}`, estilo: TIPO.pie, alineacion: 'END',
    }),
  ]
  if (conLogo && LOGO_URL) {
    cajas.push(imagen({
      x: CONTENIDO.x + CONTENIDO.ancho - LOGO.ancho, y: CHROME.pieLinea - LOGO.alto - 8,
      ancho: LOGO.ancho, alto: LOGO.alto, url: LOGO_URL,
    }))
  }
  return cajas
}

/** La pastilla que dice que lo de esta lámina viene de afuera. Arriba a la derecha, donde el ojo
 *  llega antes de leer el dato — no al pie, donde se lee después de haberlo creído. */
export function pastillaOrigen({ origen, x, y }) {
  const o = ORIGEN[origen] || ORIGEN.ECSAS
  if (o.clave === 'ECSAS') return []
  const ancho = 96
  return [
    rect({ x: x - ancho, y, ancho, alto: 15, relleno: o.fondo, borde: { color: o.borde, grosor: 0.75 }, forma: 'ROUND_RECTANGLE' }),
    texto({
      x: x - ancho, y: y + 3.5, ancho, alto: 11, contenido: o.rotulo,
      estilo: { ...TIPO.kicker, color: o.color, tamano: 8 }, alineacion: 'CENTER',
    }),
  ]
}

/** La cita de la fuente al pie del cuerpo. Sin esto, un dato externo no se dibuja: la plantilla no
 *  ofrece una forma de mostrarlo sin decir de dónde salió. */
export function citaFuentes({ fuentes, x, y, ancho }) {
  if (!fuentes?.length) return []
  const linea = fuentes.map((f) => `${f.titulo}${f.url ? ` — ${f.url}` : ''}${f.obtenido_en ? ` (leído ${f.obtenido_en})` : ''}`).join('   ·   ')
  const m = medirTexto(`Fuente externa: ${linea}`, { ancho, tamano: TIPO.fuenteNota.tamano, alto: TIPO.fuenteNota.alto })
  return [texto({ x, y, ancho, alto: m.altoPt + 2, contenido: `Fuente externa: ${linea}`, estilo: TIPO.fuenteNota })]
}

/** La nota al pie del cuerpo (aclaración del autor, no fuente externa). */
export function nota({ contenido, x, y, ancho }) {
  if (!contenido) return []
  const m = medirTexto(contenido, { ancho, tamano: TIPO.kpiNota.tamano, alto: TIPO.kpiNota.alto })
  return [texto({ x, y, ancho, alto: m.altoPt + 2, contenido, estilo: TIPO.kpiNota })]
}

/** Alto del cuerpo disponible desde `y`, descontando el pie. PURA. */
export function altoDisponible(y, { reservaPie = 0 } = {}) {
  return CHROME.pieLinea - 14 - y - reservaPie
}
