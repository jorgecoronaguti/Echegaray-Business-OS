// LOS RANGOS DEL CUADRO CONTRA LOS ENCABEZADOS DE REFERENCIA — ANTES Y DESPUÉS DE INSERTAR «OBRA».
//
// Sólo para tests. El que escribe lee la fila de rótulos viva (`leerRangosDelCuadro`); usar esto para
// armar una fórmula real sería volver a la letra fija por otro camino.
//
// Cobranzas se congela HASTA BB porque ahí vive «Qué dice el banco de este valor», leído del archivo el
// 14/09/2026 (BA «▲ Control automático», BB el rótulo con la fecha del corte). `COBRANZAS_1409` termina
// en AC: sin el tramo de BA/BB el resolvedor no encuentra la columna del endoso.

import { COMPRAS_2508, COMPRAS_CON_OBRA, COBRANZAS_1409, conObraInsertada } from './encabezados-referencia.mjs'
import { rangosDelCuadro } from './cash-flow-rangos.mjs'

/** Cobranzas!A4:BB4 del 14/09/2026, con las columnas vacías entre AD y AZ. */
export const COBRANZAS_1409_HASTA_BB = Object.freeze([
  ...COBRANZAS_1409, ...Array(52 - COBRANZAS_1409.length).fill(null),
  '▲ Control automático', 'Qué dice el banco de este valor · al 2026-09-14',
])

/** Lo mismo, con «Obra» en H. */
export const COBRANZAS_HASTA_BB_CON_OBRA = conObraInsertada(COBRANZAS_1409_HASTA_BB, 'Obra / Cliente')

/** Los rangos con el layout de hoy. */
export const RANGOS_ANTES = rangosDelCuadro({ compras: COMPRAS_2508, cobranzas: COBRANZAS_1409_HASTA_BB })

/** Los rangos con «Obra» insertada en las dos pestañas. */
export const RANGOS_DESPUES = rangosDelCuadro({ compras: COMPRAS_CON_OBRA, cobranzas: COBRANZAS_HASTA_BB_CON_OBRA })
