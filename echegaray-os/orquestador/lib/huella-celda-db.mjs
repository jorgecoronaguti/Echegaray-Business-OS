// LA CONEXIÓN DE `sheet_huella_celda`, PRESTABLE (25/09/2026).
//
// `huella-celda.mjs` y `huella-footprint.mjs` son dos módulos sobre UNA sola tabla: la marca de
// borrado que escribe uno y el footprint que escribe el otro tienen que verse entre sí en la MISMA
// transacción cuando un test presta la conexión, o el barrido de uno correría por fuera de lo que el
// otro todavía no confirmó. Por eso viven de este único punto y no de dos `AsyncLocalStorage`
// independientes — ver `conexion-prestable.mjs` para el motivo completo del mecanismo.
import { query } from './db.mjs'
import { crearConexionPrestable } from './conexion-prestable.mjs'

export const { ejecutar, conConexion } = crearConexionPrestable(query)
