// «COSTO A LA OBRA» DE LIQUIDACIÓN LEE LA DEFINICIÓN ÚNICA — `public.costo_mo_quincena` (20260915T0500).
//
// ═══ POR QUÉ NO SE CALCULA ACÁ ═══
//
// Hasta el 14/09/2026 esta solapa armaba su propio número: horas × $/h × multiplicador promedio de
// cargas (1,671) sobre TODO el $/h, incluida la parte en negro, y el sueldo del jefe dividido por las
// horas del mes a la fecha. La ficha del CRM hacía otra cuenta parecida en SQL. Ahora las dos leen la
// misma función: la foto sellada si la quincena cerró, o el cálculo en vivo si no. Este archivo sólo
// agrupa por obra y dice qué falta.
//
// ═══ UN FALTA_DATO NO SUMA, Y SE NOMBRA ═══
//
// Una persona sin tarifa no entra al costo de la obra ni como cero ni como «parcial»: su fila viaja con
// las horas y el nombre, y la pantalla lo escribe al lado.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Quincena } from './quincena.ts'
import { getManoDeObraPresupuestada, type Falla } from './costoLecturas.ts'

export type { Falla }

export type EstadoDeCosto = 'real' | 'estimado' | 'falta_dato'

/** Una fila de `costo_mo_quincena`: persona × obra (null = Estructura). */
export interface FilaDeCostoQuincena {
  obraId: string | null
  personaId: string | null
  horas: number
  blanco: number | null
  negro: number | null
  total: number | null
  estado: EstadoDeCosto
  origen: string
  selladoEn: string | null
}

export interface SinDato { personaId: string | null; nombre: string; horas: number; origen: string }

export interface LineaDeCostoObra {
  obraId: string | null
  rotulo: string
  horas: number
  gente: number
  /** Σ de las filas valorizadas. `null` = ninguna persona de la obra tiene costo. */
  blanco: number | null
  negro: number | null
  costo: number | null
  /** La parte de `costo` que es estimada (sin recibo del período todavía). */
  estimado: number
  sinDato: SinDato[]
  presupuesto: number | null
  consumo: number | null
}

const numero = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const texto = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const ESTADOS: readonly EstadoDeCosto[] = ['real', 'estimado', 'falta_dato']

/** Las filas crudas de la RPC. Una fila con estado desconocido se descarta: no se adivina qué es. */
export function filasDeCosto(data: unknown): FilaDeCostoQuincena[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((x): FilaDeCostoQuincena[] => {
    const r = x as Record<string, unknown>
    const estado = r.estado as EstadoDeCosto
    if (!ESTADOS.includes(estado)) return []
    return [{
      obraId: texto(r.obra_canonica_id), personaId: texto(r.persona_id), horas: numero(r.horas) ?? 0,
      blanco: numero(r.costo_blanco), negro: numero(r.costo_negro), total: numero(r.costo_total),
      estado, origen: texto(r.origen) ?? '', selladoEn: texto(r.sellado_en),
    }]
  })
}

const sumar = (a: number | null, b: number | null): number | null => (b == null ? a : (a ?? 0) + b)

/** Agrupa por obra. Estructura (obra null) es una línea más, al final. Pura. */
export function lineasDeCostoObra(
  filas: readonly FilaDeCostoQuincena[], rotulos: ReadonlyMap<string, string>,
  nombres: ReadonlyMap<string, string>, presupuesto: ReadonlyMap<string, number>,
): LineaDeCostoObra[] {
  const acc = new Map<string, LineaDeCostoObra & { personas: Set<string> }>()
  for (const f of filas) {
    const clave = f.obraId ?? ''
    const l = acc.get(clave) ?? {
      obraId: f.obraId, rotulo: f.obraId == null ? 'Estructura (sin obra)' : rotulos.get(f.obraId) ?? f.obraId,
      horas: 0, gente: 0, blanco: null, negro: null, costo: null, estimado: 0, sinDato: [],
      presupuesto: null, consumo: null, personas: new Set<string>(),
    }
    l.horas += f.horas
    if (f.personaId) l.personas.add(f.personaId)
    if (f.estado === 'falta_dato') {
      l.sinDato.push({ personaId: f.personaId, nombre: f.personaId ? nombres.get(f.personaId) ?? f.personaId : 'fila sin persona', horas: f.horas, origen: f.origen })
    } else {
      l.blanco = sumar(l.blanco, f.blanco)
      l.negro = sumar(l.negro, f.negro)
      l.costo = sumar(l.costo, f.total)
      if (f.estado === 'estimado') l.estimado += f.total ?? 0
    }
    acc.set(clave, l)
  }
  return [...acc.values()].map(({ personas, ...l }) => {
    const base = l.obraId == null ? null : presupuesto.get(l.obraId) ?? null
    return {
      ...l, horas: Math.round(l.horas * 100) / 100, gente: personas.size, presupuesto: base,
      consumo: l.costo == null || base == null || base <= 0 ? null : (l.costo / base) * 100,
    }
  }).sort((a, b) => (a.obraId == null ? 1 : b.obraId == null ? -1 : b.horas - a.horas))
}

/** 42883 / PGRST202: la función no existe todavía en la base (migración sin aplicar). */
const sinFuncion = (e: { code?: string; message: string }): boolean =>
  e.code === '42883' || e.code === 'PGRST202' || /could not find the function|does not exist/i.test(e.message)

/**
 * LA QUINCENA CARGADA A CADA OBRA. Son ~40 filas por quincena (persona × obra): lejos del tope de
 * `db-max-rows`, que corta en 1.000 sin error.
 */
export async function getCostoObraQuincena(
  supabase: SupabaseClient, q: Quincena,
): Promise<{ lineas: LineaDeCostoObra[]; selladoEn: string | null; errores: Falla[] }> {
  // EL PRESUPUESTO POR LA PUERTA DE COSTO-HORA (`costoLecturas.ts`, excepción declarada en definiciones.json).
  const [costo, canonicas, oep, personas] = await Promise.all([
    supabase.rpc('costo_mo_quincena', { p_desde: q.desde }),
    supabase.from('obra_canonica').select('id, nombre'),
    getManoDeObraPresupuestada(supabase),
    supabase.from('persona_directorio').select('id, nombre_completo'),
  ])
  const errores: Falla[] = []
  if (costo.error) {
    errores.push({
      que: 'el costo de mano de obra por obra',
      error: sinFuncion(costo.error) ? 'La migración 20260915T0500 todavía no está aplicada.' : costo.error.message,
    })
  }
  if (oep.error) errores.push(oep.error)
  const rotulos = new Map((canonicas.data ?? []).map((o) => [String(o.id), String(o.nombre ?? o.id)]))
  const nombres = new Map((personas.data ?? []).map((p) => [String(p.id), String(p.nombre_completo ?? '')]))
  const presupuesto = oep.presupuesto
  const filas = filasDeCosto(costo.data)
  return {
    lineas: lineasDeCostoObra(filas, rotulos, nombres, presupuesto),
    selladoEn: filas.find((f) => f.selladoEn != null)?.selladoEn ?? null,
    errores,
  }
}
