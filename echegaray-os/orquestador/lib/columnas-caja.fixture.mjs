// LAS COLUMNAS DE COBRANZAS Y COMPRAS QUE CAJA E IMPUESTOS RECIBEN EN PRODUCCIÓN — para los tests.
//
// En la corrida real salen de `columnasDeCaja` / `leerColumnasCobranzas` contra las filas de rótulos
// VIVAS. Acá se arman contra los encabezados de referencia congelados, antes y después de insertar
// «Obra» (Cobranzas H, Compras L), para que cada test pueda probar los dos layouts sin tocar Google.

import { COMPRAS, columnasDe } from './columnas-por-encabezado.mjs'
import { columnasCobranzas } from './cobranzas-columnas.mjs'
import { COBRANZAS_1409, COBRANZAS_CON_OBRA, COMPRAS_2508, COMPRAS_CON_OBRA } from './encabezados-referencia.mjs'
import { COLUMNAS_CMP, mapasDe } from './caja-posterior-al-corte.mjs'

const comprasDeCaja = (encabezado) =>
  columnasDe(encabezado, Object.fromEntries(COLUMNAS_CMP.map((k) => [k, COMPRAS[k]])), 'Compras')

/** `refs.columnas` con el layout de hoy. */
export const COLUMNAS_HOY = Object.freeze({ cobranzas: columnasCobranzas(COBRANZAS_1409), compras: comprasDeCaja(COMPRAS_2508) })
/** `refs.columnas` con «Obra» insertada en las dos pestañas. */
export const COLUMNAS_CON_OBRA = Object.freeze({ cobranzas: columnasCobranzas(COBRANZAS_CON_OBRA), compras: comprasDeCaja(COMPRAS_CON_OBRA) })

/** Los mapas `{cob, cmp}` que reciben las fórmulas de CAJA. */
export const MAPAS_HOY = mapasDe({ columnas: COLUMNAS_HOY })
export const MAPAS_CON_OBRA = mapasDe({ columnas: COLUMNAS_CON_OBRA })

/** Las columnas de Cobranzas solas, para las funciones que piden `cols`/`cob`. */
export const COB_HOY = COLUMNAS_HOY.cobranzas
export const COB_CON_OBRA = COLUMNAS_CON_OBRA.cobranzas
