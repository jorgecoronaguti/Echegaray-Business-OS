// A QUÉ RITMO SE CONSUME CADA OBRA — y cuántos meses le dura lo que queda.
//
// Las filas salen de `analiticas_consumo_mensual`: el mismo costo de `costo_de_obras_a_la_fecha`,
// abierto por mes (materiales y subcontratos por fecha del comprobante, mano de obra por el mes en que
// empieza la quincena). Este archivo no suma nada que la base no haya sumado: decide qué ventana es el
// ritmo y qué se dice cuando falta.
//
// ═══ EL RITMO ES DE MESES CERRADOS ═══
//
// El mes en curso está a medias: el 17 de septiembre lleva medio mes de compras y una quincena. Meterlo
// al promedio baja el ritmo sin que nadie haya frenado. Por eso la ventana son los TRES MESES CERRADOS
// anteriores al de hoy, y un mes de la ventana sin consumo cuenta como cero —la obra no consumió—,
// pero una obra sin NINGÚN consumo en la ventana no tiene ritmo: «sin consumo reciente».

export interface MesDeConsumo {
  obraId: string
  /** `AAAA-MM`. `null` = comprobante sin fecha: no tiene mes. */
  mes: string | null
  materiales: number | null
  subcontratos: number | null
  /** Equipos, servicios de obra y combustible (puente 18/09/2026). `null` = RPC anterior o sin consumo. */
  otros: number | null
  manoObra: number | null
  manoObraEstimada: number | null
}

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

/** Las filas crudas de la RPC. `null` = no se pudo leer (distinto de «no hay consumo»). */
export function leerConsumoMensual(crudas: unknown): MesDeConsumo[] | null {
  if (!Array.isArray(crudas)) return null
  return crudas.flatMap((c): MesDeConsumo[] => {
    const r = (c ?? {}) as Record<string, unknown>
    if (typeof r.obra_id !== 'string' || !r.obra_id) return []
    const mes = typeof r.mes === 'string' && /^\d{4}-\d{2}/.test(r.mes) ? r.mes.slice(0, 7) : null
    return [{
      obraId: r.obra_id, mes, materiales: num(r.materiales), subcontratos: num(r.subcontratos), otros: num(r.otros),
      manoObra: num(r.mano_obra), manoObraEstimada: num(r.mano_obra_estimada),
    }]
  })
}

export const MESES_RITMO = 3

/** Los `n` meses cerrados anteriores al mes de `hoy`, del más viejo al más nuevo. */
export function mesesCerrados(hoyISO: string, n = MESES_RITMO): string[] {
  const y = Number(hoyISO.slice(0, 4))
  const m = Number(hoyISO.slice(5, 7)) - 1
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - n + i, 1))
    return d.toISOString().slice(0, 7)
  })
}

export interface Ritmo {
  /** Pesos por mes, promedio de la ventana. `null` = sin consumo en la ventana. */
  porMes: number | null
  ventana: string[]
  /** `true` = la mano de obra de la ventana tiene parte estimada: el ritmo también. */
  conEstimada: boolean
}

type RubroDeConsumo = 'manoObra' | 'materiales' | 'subcontratos' | 'otros'
const TODOS: RubroDeConsumo[] = ['manoObra', 'materiales', 'subcontratos', 'otros']
const totalDe = (f: MesDeConsumo, rubros: RubroDeConsumo[]): number => rubros.reduce((a, k) => a + (f[k] ?? 0), 0)

/** El ritmo de cada obra que tiene alguna fila. Una obra que no está en el mapa no tiene consumo. */
/** `rubros`: los que cuenta el ritmo. Para el «alcanza», los mismos que el «queda» (`rubrosComparables`). */
export function ritmoPorObra(filas: MesDeConsumo[], hoyISO: string, rubros: RubroDeConsumo[] = TODOS): Map<string, Ritmo> {
  const ventana = mesesCerrados(hoyISO)
  const dentro = new Set(ventana)
  const m = new Map<string, { suma: number; hay: boolean; est: boolean; primero: string | null }>()
  for (const f of filas) {
    const a = m.get(f.obraId) ?? { suma: 0, hay: false, est: false, primero: null }
    if (f.mes != null && (a.primero == null || f.mes < a.primero)) a.primero = f.mes
    if (f.mes != null && dentro.has(f.mes)) {
      const t = totalDe(f, rubros)
      if (t > 0) a.hay = true
      a.suma += t
      if (rubros.includes('manoObra') && (f.manoObraEstimada ?? 0) > 0) a.est = true
    }
    m.set(f.obraId, a)
  }
  // UNA OBRA QUE EMPEZÓ DENTRO DE LA VENTANA se divide por los meses que lleva, no por tres: si arrancó
  // en agosto, repartir agosto en tres meses le daría un tercio del ritmo real.
  return new Map([...m.entries()].map(([id, a]) => {
    const meses = ventana.filter((x) => a.primero == null || x >= a.primero).length
    return [id, { porMes: a.hay && meses > 0 ? a.suma / meses : null, ventana, conEstimada: a.hay && a.est }]
  }))
}

/**
 * CUÁNTOS MESES LE DURA LO QUE QUEDA al ritmo de hoy. Sólo con las dos patas: sin presupuesto no hay
 * «queda», sin ritmo no hay divisor. Si ya se pasó, 0.
 */
export function mesesParaAgotar(queda: number | null, porMes: number | null): number | null {
  if (queda == null || porMes == null || porMes <= 0) return null
  return queda <= 0 ? 0 : queda / porMes
}
