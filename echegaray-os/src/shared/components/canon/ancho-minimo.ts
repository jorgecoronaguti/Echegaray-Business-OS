// EL ANCHO CON EL QUE UNA TABLA DEL CANON SIGUE SIENDO LEGIBLE — calculado, no elegido a ojo.
//
// ═══ QUÉ DEFECTO EXISTE PARA EVITAR (medido el 25/08/2026, 390×844) ═══
//
// Las tablas del canon son grillas con columnas MEZCLADAS: unas en píxeles fijos —el mockup las fija
// para que ESTADO mida siempre lo mismo entre pantallas— y otras en `minmax(0, N fr)`. Ese `0` es el
// problema: en un teléfono las columnas en px no ceden un píxel, y las fraccionales absorben TODO el
// faltante hasta quedar en cero. El resultado medido fue el peor posible:
//
//   `/presupuestos`      el encabezado se leía «PRESUPUESTOCLIENTE» (97 px de contenido cortado)
//   `/presupuestos/[id]` «PARTIDACANT.» (280 px)
//   `/clientes` y `/administracion/personas`  el nombre del cliente reducido a UNA letra: «B» por
//                        «Messina». Y sin barra de scroll que lo delatara, porque `body` lleva
//                        `overflow-x: clip` (globals.css): el dato no se corría, se CORTABA. Quien
//                        mira la pantalla no ve que falta algo — ve un dato que dice «B».
//
// ═══ POR QUÉ UN NÚMERO CALCULADO Y NO UN `min-width` a mano por tabla ═══
//
// Hay diez tablas canon vivas (presupuestos, partidas, compras, proveedores, documentos, clientes,
// personas, cuadrillas, tareas tipo, recursos) y varias cambian de columnas según el filtro —el
// listado de Inactivos de `19` cambia la geometría, `18` agrega COSTO sólo si el rol ve economía—.
// Un número escrito a mano por tabla se desincroniza el día que alguien agrega una columna, y se
// desincronizaría EN SILENCIO: la tabla volvería a cortar el nombre sin que nada se ponga rojo.
// Acá el ancho sale de la MISMA cadena `gridTemplateColumns` que dibuja la tabla, así que agregar
// una columna mueve el ancho solo.
//
// ═══ LA CUENTA ═══
//
// Las columnas en px son inelásticas: entran enteras. Las fraccionales se reparten lo que sobra EN
// PROPORCIÓN a su `fr`, y por eso el piso no se suma columna por columna: se calcula cuánto tiene
// que valer el pozo repartible para que, con ESA proporción, la columna más ancha llegue al piso del
// nombre y la más angosta al piso general. Sumar 160 + 120 daría un ancho que igual deja el nombre
// corto, porque el reparto real no es parejo.

/** Lo que mide una columna que sólo lleva texto secundario y todavía se lee (UN., FAMILIA, OBRA). */
export const PISO_COLUMNA = 120

/**
 * Lo que mide la columna que identifica la fila. 160 px es lo que necesita «Aguero Cristian Domingo»
 * para mostrar «Aguero Cristian…» en 12,5 px en vez de una inicial — el defecto que se está
 * arreglando. Menos que esto y la tabla vuelve a mentir sobre el dato.
 */
export const PISO_NOMBRE = 160

/** El `gap:10px` y el `padding:0 14px` que el canon fija para TODA fila y encabezado. */
export const GAP_CANON = 10
export const PADDING_CANON = 14

interface Pista {
  /** Cuánto ocupa si es inelástica. */
  px: number
  /** `true` si se reparte el sobrante: `1fr`, `minmax(0, 1.6fr)`, `auto`. */
  flexible: boolean
  /** El coeficiente con el que se reparte. Sin sentido si `flexible` es `false`. */
  fr: number
}

function enPx(pista: string): number | null {
  const m = /^(\d+(?:\.\d+)?)px$/.exec(pista)
  if (m) return Number(m[1])
  return pista === '0' ? 0 : null
}

function enFr(pista: string): number | null {
  const m = /^(\d+(?:\.\d+)?)fr$/.exec(pista)
  return m ? Number(m[1]) : null
}

function medir(bruto: string): Pista {
  const pista = bruto.trim()

  const minmax = /^minmax\((.+),(.+)\)$/.exec(pista)
  if (minmax) {
    const minimo = enPx(minmax[1].trim())
    // `minmax(160px, 1fr)` YA declara su piso: quien lo escribió midió esa columna y su número gana.
    if (minimo !== null && minimo > 0) return { px: minimo, flexible: false, fr: 0 }
    return { px: 0, flexible: true, fr: enFr(minmax[2].trim()) ?? 1 }
  }

  const fr = enFr(pista)
  if (fr !== null) return { px: 0, flexible: true, fr }

  const px = enPx(pista)
  if (px !== null) return { px, flexible: false, fr: 0 }

  // `auto`, `max-content`, un `calc()`: no se puede medir sin navegador. Se trata como flexible, que
  // es el lado conservador —recibe piso, no cero— y nunca deja una columna sin ancho reservado.
  return { px: 0, flexible: true, fr: 1 }
}

/** Parte `gridTemplateColumns` en columnas SIN romper adentro de un `minmax(...)`. */
export function pistasDe(cols: string): string[] {
  const salida: string[] = []
  let actual = ''
  let nivel = 0
  for (const c of cols.trim()) {
    if (c === '(') nivel += 1
    if (c === ')') nivel -= 1
    if (nivel === 0 && /\s/.test(c)) {
      if (actual) { salida.push(actual); actual = '' }
      continue
    }
    actual += c
  }
  if (actual) salida.push(actual)
  return salida
}

/**
 * El ancho mínimo con el que esa grilla todavía dice lo que tiene que decir. Devuelve 0 para una
 * cadena vacía: sin columnas no hay ancho que reservar, y un 28 de padding suelto sería ruido.
 */
export function anchoMinimoDeGrilla(
  cols: string,
  { gap = GAP_CANON, padding = PADDING_CANON }: { gap?: number; padding?: number } = {},
): number {
  const pistas = pistasDe(cols).map(medir)
  if (pistas.length === 0) return 0

  const fijo = pistas.reduce((t, p) => t + (p.flexible ? 0 : p.px), 0)
  const flexibles = pistas.filter((p) => p.flexible)

  let pozo = 0
  if (flexibles.length > 0) {
    const suma = flexibles.reduce((t, p) => t + p.fr, 0)
    const mayor = Math.max(...flexibles.map((p) => p.fr))
    const menor = Math.min(...flexibles.map((p) => p.fr))
    // La columna del nombre es la de mayor `fr` en las diez tablas canon; la de menor `fr` es la que
    // primero se queda sin aire. Las dos condiciones tienen que cumplirse, así que manda la más cara.
    pozo = Math.max((PISO_NOMBRE * suma) / mayor, (PISO_COLUMNA * suma) / menor)
  }

  return Math.ceil(fijo + pozo + gap * (pistas.length - 1) + padding * 2)
}
