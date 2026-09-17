// LAS TRES LECTURAS DE LA PANTALLA DE IMPUESTOS. Sin cálculo: la regla vive en `impuestos.ts` y la
// cerradura en la RLS (`ve_economia()`, migración 20260916T2000). Un error se devuelve como texto,
// nunca como lista vacía: «no hay nada que pagar» y «no pude leer» no pueden verse igual.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PagoSinImputar, PosicionImpuesto, Sincronizacion } from './impuestos.ts'

export type Resultado<T> = { data: T; error: null } | { data: null; error: string }

export async function getPosicion(supabase: SupabaseClient): Promise<Resultado<PosicionImpuesto[]>> {
  const { data, error } = await supabase
    .from('impuesto_posicion')
    .select('impuesto, periodo, concepto, fuente, estado, vencimiento, vencimiento_confianza, determinado, creditos, a_pagar, saldo_a_favor, pagado, pendiente, datos_al, detalle')
  if (error) return { data: null, error: error.message }
  // numeric llega como string desde PostgREST: se convierte UNA vez acá, y null sigue siendo null.
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return {
    data: (data ?? []).map((f) => ({
      ...f,
      determinado: n(f.determinado), creditos: n(f.creditos), a_pagar: n(f.a_pagar),
      saldo_a_favor: n(f.saldo_a_favor), pagado: Number(f.pagado ?? 0), pendiente: n(f.pendiente),
    })) as PosicionImpuesto[],
    error: null,
  }
}

export async function getSinImputar(supabase: SupabaseClient): Promise<Resultado<PagoSinImputar[]>> {
  const { data, error } = await supabase
    .from('impuesto_pago')
    .select('fecha, importe, descripcion, fuente, tipo')
    .eq('imputacion', 'sin_imputar')
    .order('fecha', { ascending: false })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []).map((p) => ({ ...p, importe: Number(p.importe) })) as PagoSinImputar[], error: null }
}

export async function getUltimaSincronizacion(supabase: SupabaseClient): Promise<Resultado<Sincronizacion | null>> {
  const { data, error } = await supabase
    .from('impuesto_sincronizacion')
    .select('corrio_en, lectores')
    .order('corrio_en', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { data: null, error: error.message }
  return { data: (data as Sincronizacion | null) ?? null, error: null }
}
