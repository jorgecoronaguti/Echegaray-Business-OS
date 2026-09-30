// LA DECISIÓN DE RESTITUIR EL PRESENTISMO — pura, sin base y sin red (mismo criterio que `liquidacionPermiso.ts`:
// un archivo `'use server'` sólo exporta funciones async, y una decisión que no se puede probar no es un control).
//
// Qué se perdona lo decide el SERVIDOR: la acción relee las presencias de la persona y calcula las fechas de las
// mismas causas que dibuja la celda (`causasDePerdida`). El cliente no manda fechas: un cliente que mandara
// «perdoná el 24/09» podría perdonar cualquier cosa, o una fecha que no era una pérdida.

import { causasDePerdida, type AusenciaDelDia, type TardanzaDelDia } from './presentismo.ts'

export type DecisionDeRestitucion = { ok: true; fechas: string[] } | { ok: false; error: string }

export const MENSAJE_CERRADA = 'La quincena está cerrada: no se edita.'
export const MENSAJE_NADA_QUE_RESTITUIR = 'Esta persona no tiene presentismo perdido en la quincena: no hay nada que restituir.'

/** Las fechas que hoy hacen perder el presentismo, de las MISMAS causas que la celda (una sola definición). */
export function fechasPerdidasDe(tardanzas: readonly TardanzaDelDia[], ausencias: readonly AusenciaDelDia[]): string[] {
  return [...new Set(causasDePerdida(tardanzas, ausencias).map((c) => c.fecha))].sort()
}

export function decidirRestitucion(e: { estaCerrada: boolean; fechasPerdidas: readonly string[] }): DecisionDeRestitucion {
  if (e.estaCerrada) return { ok: false, error: MENSAJE_CERRADA }
  if (e.fechasPerdidas.length === 0) return { ok: false, error: MENSAJE_NADA_QUE_RESTITUIR }
  return { ok: true, fechas: [...e.fechasPerdidas] }
}
