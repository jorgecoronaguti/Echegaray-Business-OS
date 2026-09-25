// ERP OBRAS · H3 — CÓMO SE DICEN EL AVANCE PONDERADO, EL COSTO TEÓRICO Y EL DÍA HÁBIL.
//
// Módulo puro (sin `@/`): lo prueba `node --test` y lo usan la cabecera, el Resumen (03/M04) y la
// tabla de Ítems (04b). Las cifras salen de las vistas `obra_avance_ponderado` y `obra_dias_habiles`
// (migraciones 20260923T2300/T2310). NULL nunca es 0: cada texto tiene su palabra para «no hay».

export interface AvancePonderado {
  obra_id: string
  metodo: 'costo_mo' | 'parejo' | 'manual' | 'dias_teoricos' | 'hh_plan' | string
  avance_pct: number | null
  costo_mo_total: number | null
  costo_teorico: number | null
  n_historias: number
  n_historias_sin_costo: number
  pct_sin_peso: number | null
  n_items_medidos: number
  n_items: number
}

export interface DiasHabilesObra {
  obra_id: string
  dia_habil_actual: number | null
  dias_habiles_plan: number | null
}

const pesos = (n: number) => `$ ${Math.round(n).toLocaleString('es-AR')}`
const pct = (n: number) => `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`

export const ROTULO_METODO: Record<string, string> = {
  costo_mo: 'ponderado por costo de MO',
  parejo: 'parejo entre historias',
  manual: 'ponderación a mano',
  dias_teoricos: 'ponderado por días teóricos',
  hh_plan: 'ponderado por HH plan',
}

/** «ponderado por costo de MO · 12 de 40 ítems medidos». Sin historias: «sin estructura». */
export function bajadaAvance(a: AvancePonderado | null): string {
  if (!a || a.n_historias === 0) return 'sin estructura'
  // Serie B: hay historias pero ninguna pesa (ninguna tiene costo de MO): el avance no se puede ponderar.
  if (a.avance_pct == null && a.n_historias_sin_costo === a.n_historias) return `${a.n_historias_sin_costo} de ${a.n_historias} ${a.n_historias === 1 ? 'historia' : 'historias'} sin costo de MO · no pesan`
  const metodo = ROTULO_METODO[a.metodo] ?? a.metodo
  return `${metodo} · ${a.n_items_medidos} de ${a.n_items} ítems medidos`
}

/** La palabra cuando no hay cifra: sin historias, «sin estructura»; con historias que no pesan, «sin peso». */
export function faltaAvance(a: AvancePonderado | null): string {
  if (!a || a.n_historias === 0) return 'sin estructura'
  // Pesa pero ninguna tarea tiene registro: «sin medir», no 0 % (20260925T1110).
  return a.n_historias_sin_costo === a.n_historias ? 'sin peso' : 'sin medir'
}

/** La cifra grande del avance: «42,5 %» o null (se dibuja con `falta`). */
export function cifraAvance(a: AvancePonderado | null): string | null {
  if (!a || a.n_historias === 0 || a.avance_pct == null) return null
  return pct(a.avance_pct)
}

/**
 * «Costo teórico $ 3.100.000 de $ 7.400.000 de MO». Sin costo cargado en ninguna historia: null y la
 * bajada dice cuántas faltan. Con algunas sin costo: la cifra va con «· N historias sin costo».
 */
export function costoTeorico(a: AvancePonderado | null): { cifra: string | null; bajada: string } {
  if (!a || a.n_historias === 0) return { cifra: null, bajada: 'sin estructura' }
  if (a.costo_mo_total == null || a.costo_mo_total === 0) {
    return { cifra: null, bajada: `${a.n_historias_sin_costo} de ${a.n_historias} historias sin costo de MO` }
  }
  const cifra = `${pesos(a.costo_teorico ?? 0)} de ${pesos(a.costo_mo_total)} de MO`
  const bajada = a.n_historias_sin_costo > 0
    ? `${a.n_historias_sin_costo} ${a.n_historias_sin_costo === 1 ? 'historia' : 'historias'} sin costo de MO · no pesan`
    : 'según el avance ponderado'
  return { cifra, bajada }
}

/** «día hábil 23 de 60» · sin inicio real: «sin inicio real» · sin plan: «día hábil 23 · sin plan». */
export function diaHabil(d: DiasHabilesObra | null): string {
  if (!d || d.dia_habil_actual == null) return 'sin inicio real'
  if (d.dias_habiles_plan == null) return `día hábil ${d.dia_habil_actual} · sin plan`
  return `día hábil ${d.dia_habil_actual} de ${d.dias_habiles_plan}`
}

/** «$ 1.200.000 · 16,2 %» al lado del nombre de la historia; sin costo: «sin costo de MO · no pesa». */
export function rotuloHistoria(h: { costo_mo: number | null; peso: number | null }): { texto: string; tono: 'normal' | 'warn' } {
  if (h.costo_mo == null) return { texto: 'sin costo de MO · no pesa', tono: 'warn' }
  const peso = h.peso == null ? '' : ` · ${pct(h.peso * 100)}`
  return { texto: `${pesos(h.costo_mo)}${peso}`, tono: 'normal' }
}
