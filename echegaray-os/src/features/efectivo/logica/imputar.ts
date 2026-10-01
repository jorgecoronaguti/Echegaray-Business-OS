// IMPUTAR A UNA ENTREGA UNA COMPRA YA CARGADA (dueño, 24/09/2026) — lo puro: qué se lista y qué se dice.
//
// El caso: un ticket pagado con plata de una entrega entró por #comprobantes-gastos sin número y quedó en
// Compras con Tipo pago «Efectivo». CAJA lo resta otra vez (la plata ya salió con la entrega) y el saldo de
// la persona no baja. Desde la ficha de la entrega se elige esa fila y la base (`imputar_compra_a_entrega`,
// migración 20260925T1000) la pasa a «A rendir» por la cola de Compras y la ata a la entrega.
//
// QUÉ SE LISTA (dueño, 01/10/2026: «no está contemplado el caso de que la compra haya sido cargada a través del
// canal del bot comprobantes gastos y después asignársela a la rendición de una persona»): toda compra PAGADA de
// los últimos 90 días que no esté atada a ninguna entrega, con cualquier medio de pago y con o sin número de
// comprobante. La lista abre en lo más probable —Efectivo y «A rendir»— y «todos los medios» muestra el resto.
// La base vuelve a verificar todo al imputar (20261001T0100); esto sólo arma la lista.

import { diaAR, pesos } from './entregas.ts'

/** Cuántos días para atrás se miran las compras. */
export const DIAS_A_MIRAR = 90

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
  estado: string | null
  anulada: boolean | null
}

export interface Candidata {
  fila: number
  /** `null` = la fila no tiene número de comprobante: se ata por fila. */
  clave: string | null
  fecha: string | null
  proveedor: string | null
  concepto: string | null
  comprobante: string | null
  obra: string | null
  total: number
  /** El medio de pago que dice hoy la fila («Efectivo», «Transferencia», «A rendir»…). */
  tipoPago: string
  /** Ya dice «A rendir» y no está atada a ninguna entrega: se ata sin tocar el Sheet. */
  yaARendir: boolean
  /** La fila tiene un pago de la app esperando al Sheet: la base no deja encolar otro encima. */
  conPagoEnCola: boolean
}

/** Lo que ya está atado a alguna entrega: por clave (con número) o por fila (sin número y manuales). */
export interface Tomadas { claves: ReadonlySet<string>; filas: ReadonlySet<number> }

/** El primer día que se mira (ISO), contado desde hoy en San Juan. */
export function desdeDia(hoy: string, dias = DIAS_A_MIRAR): string {
  const t = Date.parse(`${diaAR(hoy)}T00:00:00Z`) - dias * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

const esARendir = (t: string) => t.toLowerCase() === 'a rendir'

/**
 * LAS QUE SE PUEDEN IMPUTAR, las más nuevas primero. Afuera: anuladas, sin total y las ya atadas a cualquier
 * entrega. Las que no están pagadas no se ofrecen (una compra sin pagar no rinde nada: primero el pago en
 * Compras) y se cuentan aparte para decirlo, no se esconden.
 */
export function candidatasDe(
  filas: readonly FilaCandidata[],
  tomadas: Tomadas,
  enCola: ReadonlySet<number>,
): { candidatas: Candidata[]; sinPagar: number } {
  let sinPagar = 0
  const candidatas: Candidata[] = []
  for (const f of filas) {
    if (f.anulada || !(Number(f.total) > 0)) continue
    if (tomadas.filas.has(f.fila) || (f.clave != null && tomadas.claves.has(f.clave))) continue
    if ((f.estado ?? '').trim() !== 'Pagado') { sinPagar += 1; continue }
    const tipoPago = (f.tipo_pago ?? '').trim()
    candidatas.push({
      fila: f.fila, clave: f.clave, fecha: f.fecha, proveedor: f.proveedor, concepto: f.concepto,
      comprobante: f.comprobante, obra: f.obra, total: Number(f.total), tipoPago, yaARendir: esARendir(tipoPago),
      conPagoEnCola: enCola.has(f.fila),
    })
  }
  candidatas.sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '') || b.fila - a.fila)
  return { candidatas, sinPagar }
}

/**
 * Lo que se ve. Sin texto: Efectivo y «A rendir» (o todo, con `todos`). Con texto se busca en TODOS los medios
 * —proveedor, concepto, obra, número de comprobante o fila—: quien escribe un nombre busca esa compra.
 */
export function filtrarCandidatas(cs: readonly Candidata[], texto: string, todos: boolean): Candidata[] {
  const plano = (t: string | null | undefined) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const q = plano(texto).trim()
  if (!q) return cs.filter((c) => todos || c.tipoPago === 'Efectivo' || c.yaARendir)
  return cs.filter((c) => [c.proveedor, c.concepto, c.obra, c.comprobante, String(c.fila)].some((x) => plano(x).includes(q)))
}

/** Lo que va a pasar, dicho antes de apretar. Sólo lo que de verdad pasa. */
export function efectoDeImputar(a: { total: number; enSuPoder: number; persona: string; codigo: string; tipoPago: string; yaARendir: boolean }): string[] {
  const queda = Math.round((a.enSuPoder - a.total) * 100) / 100
  const fila = a.yaARendir
    ? `La fila ya dice «A rendir»: se ata a ${a.codigo} sin tocar el Sheet.`
    : a.tipoPago === 'Efectivo'
      ? `La fila pasa de «Efectivo» a «A rendir»: CAJA deja de restarla, porque esa plata ya salió con ${a.codigo}.`
      : `La fila pasa de «${a.tipoPago || 'sin medio de pago'}» a «A rendir»: deja de figurar pagada por ese medio y la rinde ${a.codigo}.`
  return [
    fila,
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
