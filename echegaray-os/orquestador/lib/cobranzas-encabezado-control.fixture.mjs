// LA FILA 4 DE COBRANZAS HASTA LA ZONA DEL CONTROL — para los tests, antes y después de «Obra».
//
// `encabezados-referencia.mjs` congela los rótulos de DATOS (A…AC). La zona propia del control
// (`cobranzas-control.mjs`) vive más a la derecha y se ubica por los rótulos que el control mismo
// escribe en la fila 4: la marca por fila y el veredicto del banco. Se arma acá, en un archivo de
// fixture, para no tocar el archivo de referencia compartido con los otros grupos.

import { COBRANZAS_1409, COBRANZAS_CON_OBRA } from './encabezados-referencia.mjs'

/** Los datos, vacío hasta la columna `marca`, y los dos rótulos de la zona. */
const conZona = (encabezado, marca) => Object.freeze([
  ...encabezado, ...Array(marca - encabezado.length).fill(null),
  '▲ Control automático', 'Qué dice el banco de este valor · al 2026-09-12',
])

/** Hoy: la marca en BA (52) y el veredicto en BB (53). */
export const COBRANZAS_1409_CON_CONTROL = conZona(COBRANZAS_1409, 52)
/** Con «Obra» insertada en H, Google corre la zona entera una columna: BB y BC. */
export const COBRANZAS_CON_OBRA_Y_CONTROL = conZona(COBRANZAS_CON_OBRA, 53)
