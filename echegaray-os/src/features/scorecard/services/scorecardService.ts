import type { SupabaseClient } from '@supabase/supabase-js'

// SCORECARD FINANCIERO — la web leyendo Supabase, no el Sheet.
//
// POR QUÉ: la pantalla anterior fallaba con "sheets: 400" porque intentaba leer el Google Sheet
// desde el server de Vercel. Eso además contradice la regla del proyecto: TODO está replicado en
// Supabase justamente para que la web no dependa de la planilla ni de una credencial de Google.
//
// Regla de esta pantalla: un DATO y una ESTIMACIÓN nunca se ven iguales. Un cobro con fecha
// esperada no es plata que entró, y mostrarlo con el mismo color que un cobro real es la forma más
// rápida de que alguien decida sobre algo que no pasó.

export type Movimiento = {
  tipo: 'cobro' | 'pago'
  fecha: string
  contraparte: string | null
  concepto: string | null
  monto: number
  confirmado: boolean
}

export type Semana = { desde: string; cobros: number; pagos: number; neto: number; acumulado: number }

export type Scorecard = {
  cobrado: number
  porCobrar: number
  pagado: number
  porPagar: number
  chequesPendientes: number
  neto: number
  semanas: Semana[]
  proximos: Movimiento[]
  porArea: { area: string; nombre: string | null; monto: number }[]
  nomina: { mes: string; jornales: number; cargas: number; esEstimacion: boolean }[]
  error?: string
}

const hoy = () => new Date().toISOString().slice(0, 10)
const sumar = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** Lunes de la semana de una fecha, en ISO. */
export function lunesDe(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  const dia = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dia)
  return d.toISOString().slice(0, 10)
}

/** NÚCLEO PURO: agrupa los movimientos en semanas y acumula el saldo. */
export function agruparSemanas(movs: Movimiento[], desde: string, cuantas = 12): Semana[] {
  const base = lunesDe(desde)
  const idx = new Map<string, Semana>()
  for (let i = 0; i < cuantas; i++) {
    const d = new Date(`${base}T00:00:00`)
    d.setDate(d.getDate() + i * 7)
    const k = d.toISOString().slice(0, 10)
    idx.set(k, { desde: k, cobros: 0, pagos: 0, neto: 0, acumulado: 0 })
  }
  for (const m of movs) {
    const k = lunesDe(m.fecha)
    const s = idx.get(k)
    if (!s) continue
    if (m.monto >= 0) s.cobros += m.monto
    else s.pagos += -m.monto
  }
  let ac = 0
  const out = [...idx.values()].sort((a, b) => a.desde.localeCompare(b.desde))
  for (const s of out) { s.neto = s.cobros - s.pagos; ac += s.neto; s.acumulado = ac }
  return out
}

export async function getScorecard(supabase: SupabaseClient): Promise<Scorecard> {
  const vacio: Scorecard = {
    cobrado: 0, porCobrar: 0, pagado: 0, porPagar: 0, chequesPendientes: 0, neto: 0,
    semanas: [], proximos: [], porArea: [], nomina: [],
  }
  try {
    const hoyIso = hoy()
    const [cal, area, nom] = await Promise.all([
      supabase.from('calendario_caja').select('*').gte('fecha', hoyIso).order('fecha').limit(2000),
      supabase.from('egreso_por_area').select('area, area_nombre, total'),
      supabase.from('nomina_por_mes').select('*').order('mes'),
    ])
    const movs = ((cal.data ?? []) as Movimiento[])

    const cobros = await supabase.from('cobranza').select('total, fecha_cobro')
    const c = cobros.data ?? []
    const cobrado = sumar(c.filter((x) => x.fecha_cobro).map((x) => Number(x.total)))
    const porCobrar = sumar(c.filter((x) => !x.fecha_cobro).map((x) => Number(x.total)))

    const porAreaMap = new Map<string, { area: string; nombre: string | null; monto: number }>()
    for (const r of (area.data ?? []) as { area: string; area_nombre: string | null; total: number }[]) {
      const e = porAreaMap.get(r.area) ?? { area: r.area, nombre: r.area_nombre, monto: 0 }
      e.monto += Number(r.total) || 0
      porAreaMap.set(r.area, e)
    }

    const semanas = agruparSemanas(movs, hoyIso, 12)
    return {
      cobrado,
      porCobrar,
      pagado: sumar(movs.filter((m) => m.monto < 0).map((m) => -m.monto)),
      porPagar: sumar(movs.filter((m) => m.monto < 0 && m.fecha <= addDias(hoyIso, 30)).map((m) => -m.monto)),
      chequesPendientes: 0,
      neto: semanas.length ? semanas[semanas.length - 1].acumulado : 0,
      semanas,
      proximos: movs.slice(0, 40),
      porArea: [...porAreaMap.values()].sort((a, b) => b.monto - a.monto),
      nomina: ((nom.data ?? []) as { mes: string; jornales: number; cargas_sociales: number; es_estimacion: boolean }[])
        .map((r) => ({ mes: r.mes, jornales: Number(r.jornales), cargas: Number(r.cargas_sociales), esEstimacion: r.es_estimacion })),
    }
  } catch (e) {
    return { ...vacio, error: e instanceof Error ? e.message : String(e) }
  }
}

function addDias(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
import type { ScorecardDominio } from '../types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

function toServiceError(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Error desconocido al conectar con Supabase'
}

export async function getScorecardDominios(supabase: SupabaseClient): Promise<ServiceResult<ScorecardDominio[]>> {
  try {
    const { data, error } = await supabase
      .from('scorecard_dominios')
      .select('*')
      .order('nivel_actual', { ascending: true })
    if (error) return { data: null, error: error.message }
    return { data: data as ScorecardDominio[], error: null }
  } catch (err) {
    return { data: null, error: toServiceError(err) }
  }
}
