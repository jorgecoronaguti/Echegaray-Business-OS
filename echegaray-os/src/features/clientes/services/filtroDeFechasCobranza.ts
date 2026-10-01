// EL FILTRO DE FECHAS DE LA SOLAPA COBRANZAS — lógica pura, sin React.
//
// Dueño, 01/10/2026: un filtro por «fecha de factura» y por «fecha de cobro», con la guía de la
// pestaña Cobranzas del Sheet (col. Q «Fecha de Factura», col. R «Fecha cobro»).
//
// ═══ LA TRAMPA DE NOMBRES ═══
// El sync (`sync-cobranzas.mjs`) guarda «Fecha de Factura» (Q) en `cobranzas.fecha_venta`, «Fecha
// cobro» (R) en `fecha_cobro` y «Fecha de Venta» (C) en `fecha_emision`. Por eso el filtro «Factura»
// mira `fecha_venta` y NO `fecha_emision`: filtrar por `fecha_emision` filtraría por la columna C,
// que es otra fecha. El rótulo de pantalla es el del Sheet; el nombre de campo es el de la base.
//
// Entra por el MISMO camino que el recorte B/N (antes de `recortar`), de modo que las cuentas de
// las opciones, las cifras de arriba y las filas de abajo salen todas de la misma población.

import type { FilaCobranza } from './cobranzasCliente'

export interface RangoDeFechas {
  desde: string | null
  hasta: string | null
}

export interface FiltroDeFechas {
  /** «Fecha de Factura» (col. Q del Sheet) = `fecha_venta` en la base. */
  factura: RangoDeFechas
  /** «Fecha cobro» (col. R). En lo pendiente es la fecha en que se ESPERA cobrar. */
  cobro: RangoDeFechas
}

export const SIN_FECHAS: FiltroDeFechas = {
  factura: { desde: null, hasta: null },
  cobro: { desde: null, hasta: null },
}

/** `AAAA-MM-DD` y un día que existe: `2026-02-30` no es una fecha. Todo lo demás se ignora. */
export function fechaValida(v: string | null | undefined): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v
}

export function leerFiltroDeFechas(q: {
  fdesde?: string; fhasta?: string; cdesde?: string; chasta?: string
}): FiltroDeFechas {
  return {
    factura: { desde: fechaValida(q.fdesde), hasta: fechaValida(q.fhasta) },
    cobro: { desde: fechaValida(q.cdesde), hasta: fechaValida(q.chasta) },
  }
}

const rangoActivo = (r: RangoDeFechas) => r.desde !== null || r.hasta !== null

export const hayFechasActivas = (f: FiltroDeFechas) => rangoActivo(f.factura) || rangoActivo(f.cobro)

/** Inclusivo en los dos extremos. Una fila SIN esa fecha no pasa un rango activo: no se adivina. */
export function entraEnRango(fecha: string | null | undefined, r: RangoDeFechas): boolean {
  if (!rangoActivo(r)) return true
  const d = fechaValida(fecha?.slice(0, 10))
  if (!d) return false
  return (r.desde === null || d >= r.desde) && (r.hasta === null || d <= r.hasta)
}

export function filtrarPorFechas(
  filas: readonly FilaCobranza[], f: FiltroDeFechas,
): FilaCobranza[] {
  return filas.filter((fila) => entraEnRango(fila.fecha_venta, f.factura) && entraEnRango(fila.fecha_cobro, f.cobro))
}
