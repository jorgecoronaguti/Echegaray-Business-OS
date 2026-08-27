// LAS PIEZAS CON LAS QUE SE DIBUJA UNA LÁMINA, Y EL MARCO QUE COMPARTEN TODAS.
//
// Una «caja» es geometría + contenido, sin una sola llamada a la API. Ese es el punto: la lámina
// se puede componer, medir y auditar entera sin credenciales de Google, y `requests.mjs` la
// traduce después. Todo el control de calidad trabaja sobre cajas, no sobre lo que Google devolvió
// — porque cuando Google devuelve, la presentación ya existe y el defecto ya se publicó.
//
// PURO.

import { COLOR, CONTENIDO, LOGO, LOGO_URL, MARGEN, ORIGEN, PAGINA, SLACK_UNA_LINEA, TIPO } from './marca.mjs'
import { anchoTexto, medirTexto } from './layout.mjs'

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
  // Sin `alto` la caja queda invisible para el control de calidad: no desborda, no se pisa, no
  // existe — y ese es el defecto que menos se nota y más caro sale. Se exige.
  if (!Number.isFinite(alto)) throw new Error(`caja de texto sin alto: «${String(contenido).slice(0, 40)}»`)
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
  const m = medirTexto(titulo, { ancho, tamano: TIPO.titulo.tamano, alto: TIPO.titulo.alto, negrita: TIPO.titulo.negrita })
  cajas.push(texto({ x, y, ancho, alto: m.altoPt + 4, contenido: titulo, estilo: TIPO.titulo }))
  y += m.altoPt + 10
  cajas.push(rect({ x, y, ancho: CHROME.reglaAncho, alto: CHROME.reglaGrosor, relleno: COLOR.amarillo }))
  return { cajas, y: y + CHROME.reglaGrosor + 18 }
}

/**
 * LA MARCA DENOMINATIVA, dibujada. Un cuadrado amarillo y el nombre: es lo que se lee a diez metros
 * y lo único que no puede faltar. Devuelve cajas y un ancho, para que quien la use sepa cuánto
 * espacio se llevó. PURA.
 */
export function marcaEcsas({ x, y, alto = 22, sobreOscuro = false }) {
  const NOMBRE = 'ECHEGARAY'
  const BAJADA = 'CONSTRUCCIONES'
  const cuadrado = alto * 0.52
  const tamano = alto * 0.46
  const tamanoBajada = tamano * 0.6
  const sangria = cuadrado + 8
  // Se MIDEN las dos palabras: un ancho a ojo dejaba «ECHEGARAY» partido en dos líneas, que es el
  // mismo defecto que este módulo existe para evitar.
  const anchoNombre = anchoTexto(NOMBRE, tamano, { negrita: true })
  const anchoBajada = anchoTexto(BAJADA, tamanoBajada, { negrita: false })
  const anchoLetras = Math.max(anchoNombre, anchoBajada) * SLACK_UNA_LINEA
  return {
    ancho: sangria + anchoLetras,
    alto,
    cajas: [
      rect({ x, y: y + (alto - cuadrado) / 2, ancho: cuadrado, alto: cuadrado, relleno: COLOR.amarillo }),
      texto({
        x: x + sangria, y, ancho: anchoLetras, alto: tamano * 1.15,
        contenido: NOMBRE, estilo: { tamano, negrita: true, alto: 1.1, color: sobreOscuro ? COLOR.papel : COLOR.tinta },
      }),
      texto({
        x: x + sangria, y: y + tamano * 1.2, ancho: anchoLetras, alto: tamanoBajada * 1.3,
        contenido: BAJADA, estilo: { tamano: tamanoBajada, negrita: false, alto: 1.1, color: sobreOscuro ? '#9C9C97' : COLOR.suave },
      }),
    ],
  }
}

/** Pie: línea, identidad + obra a la izquierda, número de lámina a la derecha, logo si hay URL. */
export function pie({ numero, total, obra = null, cliente = null, conLogo = true }) {
  const izquierda = ['ECHEGARAY CONSTRUCCIONES', obra, cliente].filter(Boolean).join('  ·  ')
  const cajas = [
    regla({ x: CONTENIDO.x, y: CHROME.pieLinea, ancho: CONTENIDO.ancho }),
    texto({ x: CONTENIDO.x, y: CHROME.pieTexto, ancho: CONTENIDO.ancho - 120, alto: 12, contenido: izquierda, estilo: TIPO.pie }),
    texto({
      x: CONTENIDO.x + CONTENIDO.ancho - 60, y: CHROME.pieTexto, ancho: 60, alto: 12,
      contenido: `${numero} / ${total}`, estilo: TIPO.pie, alineacion: 'END',
    }),
  ]
  // En las láminas de contenido el nombre de la empresa ya está escrito al pie: repetir la marca
  // sería ruido. El logo remoto sólo entra si alguien configuró una URL pública de verdad.
  if (conLogo && LOGO_URL) {
    cajas.push(imagen({
      x: CONTENIDO.x + CONTENIDO.ancho - LOGO.ancho, y: CHROME.pieLinea - LOGO.alto - 8,
      ancho: LOGO.ancho, alto: LOGO.alto, url: LOGO_URL,
    }))
  }
  return cajas
}

/** Cuánto ancho se lleva la pastilla de origen, canaleta incluida. El encabezado tiene que
 *  descontarlo: una caja de título a todo el ancho se pisa con la pastilla aunque el texto sea
 *  corto, y una caja que se pisa hoy es un título largo que se pisa mañana. PURA. */
export const ANCHO_PASTILLA = 96
export const espacioPastilla = (origen) => (origen === 'EXTERNO' ? ANCHO_PASTILLA + 16 : 0)

/** La pastilla que dice que lo de esta lámina viene de afuera. Arriba a la derecha, donde el ojo
 *  llega antes de leer el dato — no al pie, donde se lee después de haberlo creído. */
export function pastillaOrigen({ origen, x, y }) {
  const o = ORIGEN[origen] || ORIGEN.ECSAS
  if (o.clave === 'ECSAS') return []
  const ancho = ANCHO_PASTILLA
  const alto = 18
  return [
    rect({ x: x - ancho, y, ancho, alto, relleno: o.fondo, borde: { color: o.borde, grosor: 0.75 }, forma: 'ROUND_RECTANGLE' }),
    // Misma caja que el fondo y centrada en los DOS ejes: con la caja más chica y alineada arriba,
    // el renderer bajaba la línea base y el rótulo salía cortado por el borde inferior.
    texto({
      x: x - ancho, y, ancho, alto, contenido: o.rotulo,
      estilo: { ...TIPO.kicker, color: o.color, tamano: 8 }, alineacion: 'CENTER', valign: 'MIDDLE',
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
