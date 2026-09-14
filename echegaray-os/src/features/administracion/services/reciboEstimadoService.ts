// LA BASE DEL RECIBO ESTIMADO, UNA VEZ POR RENDER: conceptos de los recibos, feriados de la quincena y reglas.
//
// Las dos lecturas (`leerConceptosDeRecibos`, `leerFeriadosDeLaQuincena`) viajan en la misma tanda que el resto de
// la liquidación; `baseDelEstimado` es puro y arma las reglas con los recibos que ya leyó la exposición al convenio:
// una segunda lectura de `recibo_sueldo_linea` sería una segunda foto de los recibos en la misma pantalla.

import type { SupabaseClient } from '@supabase/supabase-js'
import { r2, reglasDelRecibo, type ConceptoDeRecibo, type ReciboParaReglas } from './reglasDelRecibo.ts'
import type { BaseDelEstimado, ReciboDeSueldo } from './sueldoBlancoNegro.ts'

export const esDiaHabil = (fecha: string): boolean => {
  const d = new Date(`${fecha.slice(0, 10)}T12:00:00Z`).getUTCDay()
  return d >= 1 && d <= 5
}

/**
 * FERIADOS HÁBILES DE LA QUINCENA (`calendario_no_laborable`, los que no son de una obra). `null` si el calendario
 * no tiene NINGUNA fila del año: «sin calendario» no es «sin feriados», y el 15/09/2026 la tabla está vacía.
 */
export async function leerFeriadosDeLaQuincena(
  supabase: SupabaseClient, desde: string, hasta: string,
): Promise<{ feriados: number | null; error: string | null }> {
  const anio = desde.slice(0, 4)
  const [enLaQuincena, delAnio] = await Promise.all([
    supabase.from('calendario_no_laborable').select('fecha').is('obra_id', null).gte('fecha', desde).lte('fecha', hasta),
    supabase.from('calendario_no_laborable').select('fecha', { count: 'exact', head: true }).is('obra_id', null)
      .gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`),
  ])
  const error = enLaQuincena.error ?? delAnio.error
  if (error) return { feriados: null, error: error.message }
  if (!delAnio.count) return { feriados: null, error: null }
  const fechas = new Set(((enLaQuincena.data ?? []) as { fecha: string }[]).map((f) => String(f.fecha).slice(0, 10)))
  return { feriados: [...fechas].filter(esDiaHabil).length, error: null }
}

/** Una línea de recibo con sus conceptos, en la forma de las reglas. Las horas «otras» son las que no son normales ni feriado. */
export function reciboParaReglas(r: ReciboDeSueldo, conceptos: readonly ConceptoDeRecibo[]): ReciboParaReglas {
  const normales = r.horasNormales ?? null, feriado = r.horasFeriado ?? null
  return {
    persona: r.cuil, periodo: r.periodo, valorHora: r.valorHora, horasNormales: normales, horasFeriado: feriado,
    horasOtras: r.horasBlanco == null ? null : Math.max(0, r2(r.horasBlanco - (normales ?? 0) - (feriado ?? 0))),
    conceptos,
  }
}

/** La base del estimado para `periodo`. `null` sin conceptos: la tabla no está aplicada o está vacía. */
export function baseDelEstimado(
  periodo: string, recibos: readonly ReciboDeSueldo[], porRecibo: ReadonlyMap<string, ConceptoDeRecibo[]>, feriados: number | null,
): BaseDelEstimado | null {
  if (porRecibo.size === 0) return null
  const paraReglas = recibos.map((r) => reciboParaReglas(r, (r.id ? porRecibo.get(r.id) : undefined) ?? []))
  return { reglas: reglasDelRecibo(paraReglas, periodo), feriados, recibos: paraReglas }
}
