// LA ESPINA DE "CARGAS SOCIALES" — UNA SOLA GRILLA PARA TODA LA PESTAÑA.
//
// POR QUÉ (23/07, y sigue vigente). El dueño: la pestaña "no respeta el patrón de diseño". La escribían
// TRES scripts distintos, cada uno con su propio ancho —había bloques de 7, 8, 9, 10 y 14 columnas—,
// así que cada cuadro empezaba y terminaba en una columna distinta del de arriba. Eso es exactamente lo
// que se ve como "descuadrado". Un solo constructor de filas no puede descuadrarse contra sí mismo.
//
// ═══ LA GRILLA ═══
//
//   A            el concepto
//   B … M        los doce meses del año, SIEMPRE en la misma columna: enero es B en todos los cuadros
//   N            el total del año
//   O            de dónde sale
//
// Es el estándar de cualquier modelo financiero serio: una sola definición de columna aplicada a todas
// las hojas, para que el ojo compare hacia abajo sin volver a leer el encabezado. Acá vale doble,
// porque toda la pestaña habla de lo mismo —el costo de la nómina— visto de siete maneras: lo
// declarado, lo pagado, la diferencia, lo que viene, cuándo sale de la caja, lo que se devengó y
// todavía no se pagó, y las cuotas de lo viejo.

import { VACIO } from './preservar-anotaciones.mjs'

/** A..O. La columna O es la de procedencia: se vacía y se rinde como nota al pie. */
export const ANCHO = 15
export const COL_ORIGEN = 'O'
export const MES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** La columna del mes N. Enero es B en TODOS los cuadros de la pestaña: ése es el punto. */
export const cm = (m) => String.fromCharCode(65 + m)
/**
 * EL RANGO DE LOS MESES CON F931 PRESENTADO — sobre el que se miden las alícuotas reales.
 *
 * ═══ ESTABA CONGELADO EN ENERO–JUNIO (27/08/2026, auditoría de la pestaña) ═══
 *
 * Era `$B$fila:$G$fila` fijo, con el comentario «los seis meses». Julio ya tiene DDJJ presentada
 * —la propia pestaña la muestra: $8.235.742, 21 empleados— y quedaba afuera de TODO lo que se mide
 * acá: la dotación proyectada, la relación entre remuneración declarada y jornales netos, y las
 * cinco alícuotas medidas. El sesgo no se corrige solo: en agosto habría seguido midiendo sobre
 * enero–junio sin que nadie se entere.
 *
 * Que el defecto era conocido lo prueba el propio test suite, que ya lo parchó para la fila
 * COMPROMETIDO leyendo la fila entera. El arreglo se hizo en un lugar y no en los otros cuatro.
 *
 * `desdeProy` es el primer mes SIN declarar, así que el último real es el anterior. Es obligatorio a
 * propósito: un default lo volvería a congelar en silencio.
 */
export const REALES = (fila, desdeProy) => {
  if (!Number.isInteger(desdeProy) || desdeProy < 2 || desdeProy > 13) {
    throw new Error(`REALES necesita desdeProy (2..13) y recibió ${desdeProy}`)
  }
  return `$B$${fila}:$${cm(desdeProy - 1)}$${fila}`
}

/** Los meses que YA tienen DDJJ: 1..desdeProy-1. El denominador de lo que se mide sobre lo real. */
export const MESES_REALES = (desdeProy) => Array.from({ length: desdeProy - 1 }, (_, i) => i + 1)

/** El constructor de la grilla: las tres formas de fila que usa la pestaña, y nada más. */
export function crearGrilla(anio) {
  const filas = []
  /** Empuja una fila rellenando hasta el ancho de la grilla y devuelve su número de fila real. */
  const push = (c = []) => {
    const r = [...c]
    // VACIO = "es mi celda y va vacía". Sin esto la fusión preservaría lo que había antes en esa
    // celda —incluidos los restos de la pestaña vieja— y el cuadro mostraría dos verdades.
    while (r.length < ANCHO) r.push(VACIO)
    for (let j = 0; j < ANCHO; j++) if (r[j] === '' || r[j] === undefined || r[j] === null) r[j] = VACIO
    filas.push(r)
    return filas.length
  }
  /** Una fila del cuadro mensual: rótulo, doce meses, total y origen. */
  const mensual = (rotulo, celda, origen, { meses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], totaliza = true } = {}) => {
    const f = filas.length + 1
    const cols = Array.from({ length: 12 }, (_, i) => (meses.includes(i + 1) ? celda(i + 1) : VACIO))
    return push([rotulo, ...cols, totaliza ? `=SUM($B${f}:$M${f})` : VACIO, origen])
  }
  const cabecera = () => push(['Concepto', ...MES.slice(1).map((m) => `'${m}-${String(anio).slice(2)}`), 'Total', 'De dónde sale'])

  return { filas, push, mensual, cabecera, n: () => filas.length }
}
