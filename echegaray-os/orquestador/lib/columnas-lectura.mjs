// LEER COMPRAS O COBRANZAS CON SU FILA DE RÓTULOS EN EL MISMO VIAJE — para los lectores por índice.
//
// ═══ POR QUÉ EXISTE (14/09/2026, inserción de «Obra» en Compras L y Cobranzas H) ═══
//
// Los lectores de este repo leían `Compras!A4:AD` y después `f[29]`: una posición. Con la columna
// nueva, `f[29]` pasa a ser la de al lado y el lector sigue sumando sin un solo error. La regla es la
// de `columnas-por-encabezado.mjs` —la columna sale del rótulo, nunca de una letra de respaldo—; acá
// sólo se resuelve la otra mitad del problema: que el índice salga de la MISMA foto que los datos.
//
// Por eso se lee DESDE la fila de rótulos y no en dos viajes: si alguien inserta una columna entre
// una lectura y la otra, dos viajes resuelven contra un layout y leen datos del otro.

import { PESTANAS, columnasDe, rangoFilas } from './columnas-por-encabezado.mjs'

/**
 * NÚCLEO PURO: separa rótulos y datos de una lectura hecha desde la fila de rótulos.
 * @param {any[][]} filas lo leído, empezando en la fila de rótulos
 * @param {'Compras'|'Cobranzas'} pestana
 * @param {Record<string, string|object>} pedidas clave → rótulo (o `{rotulo, ocurrencia}`)
 * @returns {{idx:Record<string,number>, cols:Record<string,{letra:string,indice:number}>, datos:any[][], primeraFila:number, encabezado:any[]}}
 *          `encabezado` es la fila de rótulos de ESA lectura: la que necesita quien además traduce
 *          fórmulas o lleva las filas al layout de referencia, sin un segundo viaje.
 */
export function conEncabezado(filas, pestana, pedidas) {
  const g = PESTANAS[pestana]
  if (!g) throw new Error(`pestaña sin geometría declarada: ${pestana}`)
  const encabezado = (filas ?? [])[0] ?? []
  const cols = columnasDe(encabezado, pedidas, pestana)
  const idx = Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, c?.indice]))
  return { idx, cols, datos: (filas ?? []).slice(1), primeraFila: g.primeraFila, encabezado }
}

/**
 * Lee la pestaña desde su fila de rótulos hasta `hasta` (abierto si no se da) y resuelve `pedidas`.
 * Un rótulo que falta rompe con su nombre: leer por posición daría números plausibles y equivocados.
 * @param {{readSheetValues:Function}} google
 * @param {string} fileId
 * @param {'Compras'|'Cobranzas'} pestana
 * @param {Record<string, string|object>} pedidas
 * @param {{hasta?:number|string, render?:string}} [o]
 */
export async function leerConEncabezado(google, fileId, pestana, pedidas, { hasta = '', render } = {}) {
  const g = PESTANAS[pestana]
  if (!g) throw new Error(`pestaña sin geometría declarada: ${pestana}`)
  const rango = rangoFilas(pestana, g.filaEncabezado, hasta)
  const filas = render
    ? await google.readSheetValues(fileId, rango, { render })
    : await google.readSheetValues(fileId, rango)
  return conEncabezado(filas, pestana, pedidas)
}
