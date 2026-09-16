// LA BASE DEL RECIBO ESTIMADO, UNA VEZ POR RENDER: las reglas, los feriados de la quincena y los recibos.
//
// PRIMERA ENTREGA SIN MIGRACIÓN (coordinador, 14/09/2026): las reglas son las congeladas en
// `reglasDelRecibo.generadas.ts`, no las de `recibo_sueldo_concepto`. Los recibos son los que ya leyó la
// exposición al convenio (`recibo_sueldo_linea`): deciden la jornada completa por sus horas, y una segunda lectura
// sería una segunda foto de los recibos en la misma pantalla. Los conceptos reales entran cuando la tabla exista.

import type { SupabaseClient } from '@supabase/supabase-js'
import { r2, type ConceptoDeRecibo, type ReciboParaReglas, type ReglasDelRecibo } from './reglasDelRecibo.ts'
import type { BaseDelEstimado, ReciboDeSueldo } from './sueldoBlancoNegro.ts'

export const esDiaHabil = (fecha: string): boolean => {
  const d = new Date(`${fecha.slice(0, 10)}T12:00:00Z`).getUTCDay()
  return d >= 1 && d <= 5
}

/**
 * FERIADOS HÁBILES DE LA QUINCENA (`calendario_no_laborable`, los que no son de una obra). `null` si el calendario
 * no tiene NINGUNA fila del año: «sin calendario» no es «sin feriados», y el 14/09/2026 la tabla está vacía.
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
    persona: r.cuil, periodo: r.periodo, valorHora: r.valorHora, categoria: r.categoria ?? null, horasNormales: normales, horasFeriado: feriado,
    horasOtras: r.horasBlanco == null ? null : Math.max(0, r2(r.horasBlanco - (normales ?? 0) - (feriado ?? 0))),
    conceptos,
  }
}

/** La base del estimado de `periodo`. Sin `porRecibo` (la tabla de conceptos no existe todavía), sin conceptos reales. */
export function baseDelEstimado(
  periodo: string, reglas: ReglasDelRecibo, recibos: readonly ReciboDeSueldo[], feriados: number | null,
  porRecibo: ReadonlyMap<string, ConceptoDeRecibo[]> = new Map(),
): BaseDelEstimado {
  return { periodo, reglas, feriados, recibos: recibos.map((r) => reciboParaReglas(r, (r.id ? porRecibo.get(r.id) : undefined) ?? [])) }
}
