// LA COLA DE LA CORRIDA ANTERIOR — cuando la grilla nueva es MÁS CORTA que la que ya estaba.
//
// ═══ POR QUÉ EXISTE (05/08) ═══
//
// El bloque de control contra ARCA pasó de 13 filas a 9. Las cuatro que sobraban se quedaron en la
// pestaña, y una de ellas era justamente la línea que se había eliminado por ser falsa: "· El resto —
// facturas cargadas por un IMPORTE distinto al que ARCA registró". Ya sin las celdas que la
// alimentaban, quedó mostrando `#VALUE!`. En Recurrentes se leía así:
//
//   26  · El resto — facturas cargadas por un IMPORTE distinto…   #VALUE!
//   27  ⓘ Fuera de ARCA por naturaleza — jornales, cargas…
//   28  ⓘ Facturas POSTERIORES a la ventana                       67797,51
//   29  #VALUE!
//
// Un texto retirado que sobrevive es peor que uno que nunca se escribió: sigue afirmando, y encima
// con un error al lado. El generador es dueño de TODO su footprint, no sólo de las filas que escribe
// hoy — también de las que escribió ayer.
//
// ═══ POR QUÉ `VACIO` Y NO `''` ═══
//
// La fusión de `preservar-anotaciones.mjs` lee la cadena vacía como "esta celda no es mía,
// preservala", justamente para no pisar lo que escribió una persona. Rellenar la cola con `''` la
// dejaría intacta. `VACIO` es el centinela que dice "es mi celda y va vacía": se limpia lo del
// generador y se respeta lo del dueño. Es la misma distinción que ya usa jornales-pestana.mjs.

import { VACIO } from './preservar-anotaciones.mjs'

/**
 * NÚCLEO PURO: la última fila con algo escrito.
 * @param {any[][]} previo lo leído de la pestaña
 * @returns {number} número de fila 1-indexado, 0 si está vacía
 */
export function ultimaFilaConContenido(previo = []) {
  let ultima = 0
  previo.forEach((f, i) => { if ((f || []).some((c) => String(c ?? '').trim())) ultima = i + 1 })
  return ultima
}

/**
 * NÚCLEO PURO: extiende la grilla con filas MÍAS Y VACÍAS hasta cubrir el footprint anterior.
 *
 * No recorta ni modifica lo que el generador sí escribe: sólo agrega abajo. Si la grilla nueva ya es
 * igual o más larga que la vieja, devuelve la misma lista sin tocarla.
 *
 * @param {any[][]} filas la grilla nueva
 * @param {number} ultima última fila con contenido de la corrida anterior
 * @param {number} ancho cuántas columnas ocupa el generador
 * @returns {{filas:any[][], limpiadas:number}}
 */
export function limpiarCola(filas = [], ultima = 0, ancho = 1) {
  if (ultima <= filas.length) return { filas, limpiadas: 0 }
  const cola = Array.from({ length: ultima - filas.length }, () => Array(ancho).fill(VACIO))
  return { filas: [...filas, ...cola], limpiadas: cola.length }
}

/**
 * Lee la pestaña y devuelve la grilla ya extendida. El envoltorio con I/O, para que los generadores
 * no repitan las tres líneas de siempre (y no se olviden de una, que es como aparecen estos huecos).
 *
 * LA LECTURA FALLA CERRADO: si no se puede leer la pestaña NO se asume que estaba vacía, porque eso
 * dejaría la cola sin limpiar sin que nadie se entere. Se propaga el error.
 */
export async function extenderConCola(google, fileId, pestaña, filas, ancho, { hasta = 400 } = {}) {
  const previo = await google.readSheetValues(fileId, `'${pestaña}'!A1:${col(ancho)}${hasta}`)
  return limpiarCola(filas, ultimaFilaConContenido(previo), ancho)
}

/** Índice 1-based → letra de columna. */
function col(n) {
  let s = ''
  for (let i = n - 1; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s
  return s
}
