// LA MARCA ECSAS EN UNA PRESENTACIÓN, MEDIDA Y EN UN SOLO LUGAR.
//
// ═══ LA SEPARACIÓN QUE DECIDE SI SALE BIEN O SALE GENÉRICA ═══
//
// El modelo aporta QUÉ decir: narrativa, jerarquía, qué entra y qué no, la recomendación. Este
// archivo y sus vecinos deciden CÓMO se ve: dónde va cada caja, qué tamaño tiene cada texto, qué
// color, cuánto aire. Eso es código, no prosa — porque una medida escrita en prosa la reinterpreta
// distinto cada corrida, y ahí es donde nace la lámina de IA que se reconoce a diez metros.
//
// Los colores NO se eligieron acá: salen del portal del cliente
// (`orquestador/comunicacion/portal/plantillas.mjs`), que es donde el dueño ya los fijó. Si algún
// día cambian, cambian ahí y acá — y que existan dos lugares es una deuda declarada, no un
// descuido: el portal es HTML y esto es la API de Slides, no comparten runtime.
//
// TODO EN PUNTOS (PT). La Slides API acepta PT y EMU; en PT los números se leen (un cuerpo de 12,5
// es un cuerpo de 12,5) y la aritmética de la grilla no arrastra errores de conversión.

/** La lámina: 16:9 estándar de Google Slides = 10 × 5,625 pulgadas. */
export const PAGINA = Object.freeze({ ancho: 720, alto: 405 })

/** Márgenes. El inferior es más grande que el superior: una lámina con el mismo aire arriba y
 *  abajo se ve caída, porque el ojo pone el centro óptico por encima del centro geométrico. */
export const MARGEN = Object.freeze({ izq: 44, der: 44, sup: 38, inf: 46 })

export const CONTENIDO = Object.freeze({
  x: MARGEN.izq,
  y: MARGEN.sup,
  ancho: PAGINA.ancho - MARGEN.izq - MARGEN.der,   // 632
  alto: PAGINA.alto - MARGEN.sup - MARGEN.inf,     // 321
})

/** Grilla de 12 columnas. Todo ancho de componente sale de acá: nunca un número suelto. */
export const GRILLA = Object.freeze({ columnas: 12, canaleta: 16 })
export const ANCHO_COLUMNA = (CONTENIDO.ancho - GRILLA.canaleta * (GRILLA.columnas - 1)) / GRILLA.columnas

/** Ancho de un tramo de `n` columnas, canaletas incluidas. PURA. */
export function columnas(n) {
  const k = Math.max(1, Math.min(GRILLA.columnas, Math.round(n)))
  return ANCHO_COLUMNA * k + GRILLA.canaleta * (k - 1)
}

/** x de la columna `i` (0-based). PURA. */
export function columnaX(i) {
  return CONTENIDO.x + (ANCHO_COLUMNA + GRILLA.canaleta) * Math.max(0, i)
}

/** Ritmo vertical. Todo alto y todo salto es múltiplo de 6: es lo que hace que dos láminas
 *  distintas se vean de la misma familia sin que nadie pueda decir por qué. */
export const RITMO = 6
/** Redondea al ritmo. PURA. */
export const alRitmo = (v) => Math.round(v / RITMO) * RITMO

// ── Color ───────────────────────────────────────────────────────────────────────────────────
// Grafito y amarillo son la marca. El resto son neutros derivados y semánticos: un verde y un rojo
// que no compiten con el amarillo, y un azul pizarra reservado para UNA cosa sola (ver ORIGEN).
export const COLOR = Object.freeze({
  grafito: '#30302F',
  amarillo: '#FDC900',
  papel: '#FFFFFF',
  tinta: '#1A1A19',
  texto: '#4A4A47',
  suave: '#6E6E6A',
  linea: '#E2E2DE',
  fondo: '#F7F7F5',
  grafitoClaro: '#4A4A48',
  positivo: '#2E6F52',
  negativo: '#A5271C',
  alerta: '#9C6500',
  externo: '#3D5A73',
  externoFondo: '#EDF2F6',
})

/**
 * LA DISTINCIÓN QUE NO ES DECORATIVA: dato de ECSAS vs. información de afuera.
 *
 * Una lámina que mezcla «facturamos $ 480 M» con «la inflación de julio fue 2,1%» y las pinta
 * igual está afirmando las dos con la misma autoridad. La primera sale de la base del OS; la
 * segunda salió de una página. Van con color, con rótulo y con la fuente al pie — y el pie no es
 * opcional: sin fuente, el dato externo no entra a la lámina.
 */
export const ORIGEN = Object.freeze({
  ECSAS: { clave: 'ECSAS', rotulo: 'DATO ECSAS', color: COLOR.grafito, fondo: COLOR.fondo, borde: COLOR.amarillo },
  EXTERNO: { clave: 'EXTERNO', rotulo: 'FUENTE EXTERNA', color: COLOR.externo, fondo: COLOR.externoFondo, borde: COLOR.externo },
})

// ── Tipografía ──────────────────────────────────────────────────────────────────────────────
// Una sola familia. Dos familias en una presentación corporativa exigen una razón, y acá no la
// hay: la jerarquía la dan el tamaño, el peso y el color, que son más baratos y más consistentes.
export const FUENTE = 'Inter'

// NO HAY `espaciado` (tracking) en esta tabla, y no es un olvido: la Slides API no expone
// letter-spacing en TextStyle. El único modo de simularlo es meter espacios finos entre letras, que
// rompe la copia, la búsqueda y la medición. Los kickers se distinguen con MAYÚSCULAS + negrita +
// tamaño + color, que es lo que la API sí puede sostener sin mentir.
export const TIPO = Object.freeze({
  portadaTitulo: { tamano: 38, negrita: true, alto: 1.08, color: COLOR.papel },
  portadaBajada: { tamano: 15, negrita: false, alto: 1.35, color: '#D8D8D4' },
  portadaPie: { tamano: 10, negrita: false, alto: 1.3, color: '#9C9C97' },
  seccionNumero: { tamano: 56, negrita: true, alto: 1, color: COLOR.amarillo },
  seccionTitulo: { tamano: 28, negrita: true, alto: 1.15, color: COLOR.papel },
  kicker: { tamano: 9.5, negrita: true, alto: 1.2, color: COLOR.suave },
  titulo: { tamano: 25, negrita: true, alto: 1.14, color: COLOR.tinta },
  subtitulo: { tamano: 13.5, negrita: false, alto: 1.35, color: COLOR.texto },
  cuerpo: { tamano: 12.5, negrita: false, alto: 1.42, color: COLOR.texto },
  bullet: { tamano: 12.5, negrita: false, alto: 1.42, color: COLOR.texto },
  kpiValor: { tamano: 30, negrita: true, alto: 1.05, color: COLOR.tinta },
  kpiRotulo: { tamano: 9, negrita: true, alto: 1.2, color: COLOR.suave },
  kpiNota: { tamano: 9.5, negrita: false, alto: 1.25, color: COLOR.suave },
  tablaCabecera: { tamano: 10, negrita: true, alto: 1.25, color: COLOR.papel },
  tablaCelda: { tamano: 10.5, negrita: false, alto: 1.3, color: COLOR.texto },
  barraRotulo: { tamano: 10.5, negrita: false, alto: 1.25, color: COLOR.texto },
  barraValor: { tamano: 10.5, negrita: true, alto: 1.25, color: COLOR.tinta },
  pie: { tamano: 8, negrita: false, alto: 1.25, color: COLOR.suave },
  fuenteNota: { tamano: 8, negrita: false, alto: 1.3, color: COLOR.externo },
})

/** El logo. Sale de la misma URL pública que usa el portal del cliente; si no está accesible, el
 *  motor dibuja el monograma en formas y la lámina sale igual (no se cuelga por una imagen). */
export const LOGO_URL = process.env.ORQ_PORTAL_LOGO_URL || 'https://app.ecsas.com.ar/logo-ecsas.png'
export const LOGO = Object.freeze({ ancho: 86, alto: 22 })

/** '#30302F' → {red,green,blue} 0..1, que es como los quiere la Slides API. PURA. */
export function rgb(hex) {
  const h = String(hex || '').replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return {
    red: parseInt(n.slice(0, 2), 16) / 255,
    green: parseInt(n.slice(2, 4), 16) / 255,
    blue: parseInt(n.slice(4, 6), 16) / 255,
  }
}

/** Luminancia relativa WCAG. PURA. */
export function luminancia(hex) {
  const c = rgb(hex)
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(c.red) + 0.7152 * lin(c.green) + 0.0722 * lin(c.blue)
}

/** Contraste WCAG entre dos colores (1..21). Lo usa el control de calidad: un texto que no se lee
 *  proyectado en una sala es un defecto, no una cuestión de gusto. PURA. */
export function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
