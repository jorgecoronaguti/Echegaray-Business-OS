// UNA LECTURA DE COMPRAS ARMADA DESDE FILAS B..O, sobre el encabezado que se pida.
//
// Los tests del cargador escriben sus filas en la forma B..O de siempre. Con la lectura por rótulo,
// el doble de Google tiene que devolver lo que devuelve la pestaña de verdad: la fila de rótulos y
// las filas completas desde A. Cada valor se ubica por su rótulo en el encabezado pedido, así que la
// MISMA fila de test sirve para el layout de hoy (`COMPRAS_2508`) y para el de después (`COMPRAS_CON_OBRA`).

import { COMPRAS_2508 } from '../encabezados-referencia.mjs'
import { CLAVES_B_O } from './compras-leidas.mjs'

/**
 * @param {any[][]} filasBaO filas con la forma B..O (B = 0)
 * @param {readonly any[]} [encabezado] la fila de rótulos de la pestaña simulada
 * @param {{obraFila?:(i:number)=>string}} [o] valor de la columna «Obra» por fila, si existe
 */
export function hojaDesdeBaO(filasBaO = [], encabezado = COMPRAS_2508, { obraFila } = {}) {
  const pos = CLAVES_B_O.map((_, i) => encabezado.indexOf(COMPRAS_2508[i + 1]))
  const iObra = encabezado.indexOf('Obra')
  return [[...encabezado], ...filasBaO.map((f, k) => {
    const out = Array(encabezado.length).fill('')
    pos.forEach((j, i) => { if (j >= 0) out[j] = f?.[i] ?? '' })
    if (iObra >= 0 && obraFila) out[iObra] = obraFila(k)
    return out
  })]
}
