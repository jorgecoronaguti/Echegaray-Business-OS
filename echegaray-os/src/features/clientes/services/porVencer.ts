// LO POR VENCER, DICHO DEBAJO DE LA CELDA Y NUNCA SUMADO.
//
// «Has inventado costos» (dueño, 15/09/2026): Subcontratos de OB-0011 decía $20.084.000 con nueve cuotas
// de Pedro Tello que vencen entre el 18/09 y el 23/10 adentro. Desde 20260915T2320 la RPC publica lo
// a la fecha y, aparte, lo por vencer por columna; este archivo decide qué escribe la celda con eso.
// Vive fuera de `costosDeObra.ts` porque ese archivo está en el tope de líneas del repo.

import { plata } from '../../../shared/utils/format.ts'
import type { CostoDeObra } from './costosDeObra.ts'

/** LA SEGUNDA LÍNEA DE LA CELDA: «+ $12.864.000 por vencer». `null` = nada por vencer, y no se dibuja. */
export function textoPorVencer(v: number | null | undefined): string | null {
  return v ? `+ ${plata(v)} por vencer` : null
}

/**
 * LO POR VENCER DE MATERIALES. Una respuesta anterior a 20260915T2320 sólo trae `comprometidoFuturo`
 * (lo comprado con fecha posterior al corte, que era todo de materiales): se toma sólo cuando la
 * respuesta tampoco trae la parte de subcontratos, porque si la trae, el total ya está repartido.
 */
export function porVencerDeMateriales(c: CostoDeObra | null | undefined): number | null {
  if (!c) return null
  if (c.materialesPorVencer != null) return c.materialesPorVencer
  // DESDE 20260918 `comprometidoFuturo` también suma lo por vencer de «otros»: si la respuesta lo abre,
  // el total ya está repartido y no es de materiales.
  return c.subcontratosPorVencer == null && c.otrosPorVencer == null ? c.comprometidoFuturo ?? null : null
}
