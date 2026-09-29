// LA FECHA DE PAGO REAL DE LA QUINCENA DE UNA PERSONA, o nada.
//
// Auditoría 29/09/2026: «LUGAR Y FECHA DE PAGO» salía sin fecha aunque la base la guarda en dos lugares. En este
// orden, y el primero que exista gana:
//   1. `nomina_recibo_neto.fecha_pago` — el recibo del estudio de ESA persona y ESE período: un hecho con origen.
//   2. `jornal_quincena.fecha_pago` (clase «real») — la fecha de caja de la quincena, la misma para todos. Su
//      comentario de columna admite que puede venir de un supuesto de Parámetros: por eso viaja con su origen y
//      el papel la marca como inferida.
// Ninguna → `null` y el papel dice «—». Una fecha inventada en un recibo es peor que el hueco.

import { mismoCuil } from './cuil.ts'
import type { FilaRecibo } from './liquidacionCuadros.ts'

export interface FechaDePago {
  /** ISO `yyyy-mm-dd`. */
  fecha: string
  origen: 'recibo' | 'jornal'
}

const esFecha = (v: string | null | undefined): v is string => v != null && /^\d{4}-\d{2}-\d{2}/.test(v)

/** `recibos` viene del más nuevo al más viejo (`cargado_en desc`): con dos cargas del mismo recibo gana la última. */
export function fechaDePagoDe(e: {
  recibos: readonly FilaRecibo[]
  cuil: string | null
  periodo: string
  jornalFechaPago: string | null
}): FechaDePago | null {
  const delRecibo = e.recibos.find((r) => r.periodo === e.periodo && mismoCuil(r.cuil, e.cuil) && esFecha(r.fecha_pago))
  if (delRecibo?.fecha_pago) return { fecha: delRecibo.fecha_pago.slice(0, 10), origen: 'recibo' }
  if (esFecha(e.jornalFechaPago)) return { fecha: e.jornalFechaPago.slice(0, 10), origen: 'jornal' }
  return null
}
