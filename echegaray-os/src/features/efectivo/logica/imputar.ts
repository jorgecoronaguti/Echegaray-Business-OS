// IMPUTAR A UNA ENTREGA UNA COMPRA YA CARGADA (dueño, 24/09/2026) — lo puro: qué se lista y qué se dice.
//
// El caso: un ticket pagado con plata de una entrega entró por #comprobantes-gastos sin número y quedó en
// Compras con Tipo pago «Efectivo». CAJA lo resta otra vez (la plata ya salió con la entrega) y el saldo de
// la persona no baja. Desde la ficha de la entrega se elige esa fila y la base (`imputar_compra_a_entrega`,
// migración 20260924T2300) la pasa a «A rendir» por la cola de Compras y la ata a la entrega.
//
// Lo que se lista lo decide la regla del dueño: compras cargadas en EFECTIVO en los últimos 30 días que no
// están imputadas a ninguna entrega. La base vuelve a verificar todo al imputar; esto sólo arma la lista.

import { diaAR, pesos } from './entregas.ts'

/** Cuántos días para atrás se miran las compras en efectivo. */
export const DIAS_A_MIRAR = 30

export interface FilaCandidata {
  fila: number
  clave: string | null
  fecha: string | null
  proveedor: string | null
  concepto: string | null
  comprobante: string | null
  obra: string | null
  total: number | null
  tipo_pago: string | null
  anulada: boolean | null
}

export interface Candidata {
  fila: number
  clave: string
  fecha: string | null
  proveedor: string | null
  concepto: string | null
  comprobante: string | null
  obra: string | null
  total: number
  /** La fila tiene un pago de la app esperando al Sheet: la base no deja encolar otro encima. */
  conPagoEnCola: boolean
}

/** El primer día que se mira (ISO), contado desde hoy en San Juan. */
export function desdeDia(hoy: string, dias = DIAS_A_MIRAR): string {
  const t = Date.parse(`${diaAR(hoy)}T00:00:00Z`) - dias * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

/**
 * LAS QUE SE PUEDEN IMPUTAR, las más nuevas primero. Afuera: otra forma de pago, anuladas, sin total, ya
 * imputadas a cualquier entrega, y las que no tienen número de comprobante (sin clave no hay vínculo: se
 * cuentan aparte para decirlo, no se esconden).
 */
export function candidatasDe(
  filas: readonly FilaCandidata[],
  tomadas: ReadonlySet<string>,
  enCola: ReadonlySet<number>,
): { candidatas: Candidata[]; sinNumero: number } {
  let sinNumero = 0
  const candidatas: Candidata[] = []
  for (const f of filas) {
    if ((f.tipo_pago ?? '').trim() !== 'Efectivo' || f.anulada || !(Number(f.total) > 0)) continue
    if (!f.clave) { sinNumero += 1; continue }
    if (tomadas.has(f.clave)) continue
    candidatas.push({
      fila: f.fila, clave: f.clave, fecha: f.fecha, proveedor: f.proveedor, concepto: f.concepto,
      comprobante: f.comprobante, obra: f.obra, total: Number(f.total), conPagoEnCola: enCola.has(f.fila),
    })
  }
  candidatas.sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '') || b.fila - a.fila)
  return { candidatas, sinNumero }
}

/** Busca por proveedor, concepto, obra, número de comprobante o fila. Sin texto, todas. */
export function filtrarCandidatas(cs: readonly Candidata[], texto: string): Candidata[] {
  const plano = (t: string | null | undefined) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = plano(texto).trim()
  if (!q) return [...cs]
  return cs.filter((c) => [c.proveedor, c.concepto, c.obra, c.comprobante, String(c.fila)].some((x) => plano(x).includes(q)))
}

/** Lo que va a pasar, dicho antes de apretar. Sólo lo que de verdad pasa. */
export function efectoDeImputar(a: { total: number; enSuPoder: number; persona: string; codigo: string }): string[] {
  const queda = Math.round((a.enSuPoder - a.total) * 100) / 100
  return [
    `La fila pasa de «Efectivo» a «A rendir»: CAJA deja de restarla, porque esa plata ya salió con ${a.codigo}.`,
    `Lo que ${a.persona} tiene en su poder pasa de ${pesos(a.enSuPoder)} a ${pesos(queda)}.`,
    ...(queda < 0 ? [`Queda en negativo: rindió ${pesos(-queda)} más de lo que se le entregó.`] : []),
  ]
}

/** En qué punto del viaje al Sheet está el cambio de Tipo pago (la cola de Compras). */
export type EnSheet = 'pendiente' | 'en_sheet' | 'rechazado' | 'sin_dato'

export function enSheetDe(estado: string | null | undefined): EnSheet {
  if (estado === 'aplicado') return 'en_sheet'
  if (estado === 'pendiente' || estado === 'procesando') return 'pendiente'
  if (estado === 'rechazado' || estado === 'error') return 'rechazado'
  return 'sin_dato'
}

export const ROTULO_EN_SHEET: Record<EnSheet, string> = {
  pendiente: 'pendiente de Sheet',
  en_sheet: '✓ «A rendir» en el Sheet',
  rechazado: 'el Sheet no lo tomó: deshacelo y revisá la fila',
  sin_dato: 'sin dato de la cola',
}
