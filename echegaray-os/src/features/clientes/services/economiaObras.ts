// LA ECONOMÍA DE CADA OBRA, LEÍDA DE UNA SOLA FUENTE: `public.obra_economia_cartera`.
//
// Es lo que la pestaña OBRAS del Flujo de Caja publica por obra —contratado, costo MO, costo
// materiales, margen— persistido por `orquestador/scripts/obras-economia-sync.mjs`. La vista
// devuelve `contratado` y `margen` en NULL a quien no ve economía (decisión 19/08: el jefe de obra
// no ve montos de venta); los costos los ve todo rol interno, igual que `obra_panel.costo_real`.
//
// «sin contrato» dejó de existir acá: si OBRAS no tiene el dato, la pantalla dice «sin precio en
// OBRAS», que es lo único cierto. Un cero diría que la obra vale cero.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface EconomiaDeObra {
  obra_canonica_id: string
  contratado: number | null
  costo_mo: number | null
  costo_materiales: number | null
  margen: number | null
}

export const SIN_PRECIO_EN_OBRAS = 'sin precio en OBRAS'

/**
 * Un fallo devuelve `null` —no un mapa vacío—: «no pude leer» y «OBRAS no tiene el dato» son dos
 * cosas distintas. Si la migración no está aplicada, la lectura falla y la pantalla sigue diciendo
 * «sin precio en OBRAS» en toda obra, que es verdad: no hay ningún dato leído.
 */
export async function getEconomiaDeObras(
  supabase: SupabaseClient,
): Promise<Map<string, EconomiaDeObra> | null> {
  const { data, error } = await supabase
    .from('obra_economia_cartera')
    .select('obra_canonica_id, contratado, costo_mo, costo_materiales, margen')
  if (error) return null
  const m = new Map<string, EconomiaDeObra>()
  for (const f of (data ?? []) as Record<string, unknown>[]) {
    m.set(String(f.obra_canonica_id), {
      obra_canonica_id: String(f.obra_canonica_id),
      contratado: aNumero(f.contratado),
      costo_mo: aNumero(f.costo_mo),
      costo_materiales: aNumero(f.costo_materiales),
      margen: aNumero(f.margen),
    })
  }
  return m
}

/** PostgREST devuelve `numeric` como texto. `null` se queda `null`: nunca se vuelve 0. */
export function aNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** El margen en % del contratado. Sin contratado (o contratado 0) no hay porcentaje. */
export function margenPct(margen: number | null, contratado: number | null): number | null {
  if (margen === null || contratado === null || contratado <= 0) return null
  return (margen / contratado) * 100
}

/**
 * SUMA QUE NO INVENTA: si NINGUNA fila trae el dato, el total es `null`; si alguna lo trae, suma las
 * que lo traen. Un total sobre filas parcialmente vacías se marca con `parcial` para que la
 * pantalla lo diga.
 */
export function sumaConHuecos(valores: (number | null)[]): { total: number | null; parcial: boolean } {
  const con = valores.filter((v): v is number => v !== null)
  if (con.length === 0) return { total: null, parcial: false }
  return { total: con.reduce((a, b) => a + b, 0), parcial: con.length < valores.length }
}

/** `–12,3 %` / `18 %`: el margen en porcentaje, sin decimales falsos. */
export function pctTexto(p: number | null): string | null {
  if (p === null) return null
  return `${p.toLocaleString('es-AR', { maximumFractionDigits: 0 })} %`
}
