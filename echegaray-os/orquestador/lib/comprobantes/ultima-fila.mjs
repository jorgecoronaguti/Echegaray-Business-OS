// ¿HASTA QUÉ FILA HAY UN GASTO EN COMPRAS? (29/09/2026)
//
// El cargador calculaba la última fila mirando SÓLO la columna Proveedor. SURI S.A. entró a las 17:44
// con el proveedor vacío (proveedor nuevo, defecto del worker viejo) y a las 18:30 Baragaño Cristian se
// escribió ENCIMA: la fila 1030 parecía libre. SURI —$1.821.532,26— desapareció de Compras y el
// registro la seguía dando por cargada.
//
// Una fila está ocupada si CUALQUIERA de las columnas que escribe el cargador tiene algo. Las de
// fórmula quedan afuera: se copian a filas sin gasto y correrían la última fila hacia abajo.

/**
 * @param {Array<Array<unknown>>} filas valores de un rango de columnas contiguas, desde la fila 1
 * @param {number[]} indices posiciones (dentro de cada fila) de las columnas que cuentan
 * @returns {number} número de la última fila (1-based) con algún dato en esas columnas; 0 si ninguna
 */
export function ultimaFilaOcupada(filas = [], indices = []) {
  let ultima = 0
  filas.forEach((r, i) => {
    if (indices.some((j) => r?.[j] != null && String(r[j]).trim() !== '')) ultima = i + 1
  })
  return ultima
}
