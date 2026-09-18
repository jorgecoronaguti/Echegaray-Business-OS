// LAS LECTURAS DE «ACREDITADO POR EL BANCO» EN EL LEGAJO. La regla está en `haberesDelBanco.ts`.
//
// Tres consultas chicas, las tres de UNA persona por `persona_id`: el certificado del banco
// (`haberes_acreditados_banco`, la escribe `orquestador/scripts/haberes-certificado-cargar.mjs`), su fila en el
// espejo de JORNALES y sus líneas de liquidación. No depende de que la persona esté en el plantel de ninguna
// quincena: un inactivo sin línea de liquidación ve igual lo que el banco le pagó.
//
// SIN PERMISO NO SE VIAJA: las tres tablas tienen RLS de sueldos y la respuesta para el jefe de obra sería
// cero filas sin error — «el banco no le pagó nada» y «no podés verlo» se dibujarían igual.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  armarHaberesDelBanco, type AcreditacionDelBanco, type ClaseDeAcreditacion, type FilaDePlanilla,
  type HaberesDelBanco, type LineaDeLiquidacion,
} from './haberesDelBanco.ts'

const numero = (v: unknown): number | null =>
  v == null || !Number.isFinite(Number(v)) ? null : Number(v)
const fecha = (v: unknown): string => String(v ?? '').slice(0, 10)

export async function getHaberesDelBanco(
  supabase: SupabaseClient, p: { personaId: string; puedeVer: boolean; anio: number },
): Promise<HaberesDelBanco> {
  if (!p.puedeVer) return armarHaberesDelBanco({ puedeVer: false, anio: p.anio, acreditaciones: [], planilla: [], liquidacion: [] })
  const desde = `${p.anio}-01-01`
  const hasta = `${p.anio}-12-31`
  const [acr, pla, liq] = await Promise.all([
    supabase.from('haberes_acreditados_banco')
      .select('fecha, importe, clase, periodo_desde, periodo_hasta, confianza, evidencia, nombre_banco')
      .eq('persona_id', p.personaId).gte('fecha', desde).lte('fecha', hasta).order('fecha'),
    supabase.from('jornales_bloque_persona')
      .select('pestana, quincena_desde, quincena_hasta, por_banco, ya_transferido')
      .eq('persona_id', p.personaId).gte('quincena_desde', desde).lte('quincena_desde', hasta),
    supabase.from('liquidacion_linea')
      .select('por_banco, pagado_banco, liquidacion_quincena!inner(desde, hasta)')
      .eq('persona_id', p.personaId)
      .gte('liquidacion_quincena.desde', desde).lte('liquidacion_quincena.desde', hasta),
  ])
  const errores: string[] = []
  if (acr.error) errores.push(`el certificado del banco: ${acr.error.message}`)
  if (pla.error) errores.push(`la planilla JORNALES: ${pla.error.message}`)
  if (liq.error) errores.push(`la liquidación: ${liq.error.message}`)

  const acreditaciones: AcreditacionDelBanco[] = ((acr.data ?? []) as Record<string, unknown>[]).map((f) => ({
    fecha: fecha(f.fecha),
    importe: Number(f.importe),
    clase: f.clase as ClaseDeAcreditacion,
    periodoDesde: f.periodo_desde ? fecha(f.periodo_desde) : null,
    periodoHasta: f.periodo_hasta ? fecha(f.periodo_hasta) : null,
    confianza: (f.confianza ?? null) as AcreditacionDelBanco['confianza'],
    evidencia: String(f.evidencia ?? ''),
    nombreBanco: String(f.nombre_banco ?? ''),
  }))
  const planilla: FilaDePlanilla[] = ((pla.data ?? []) as Record<string, unknown>[]).map((f) => ({
    pestana: String(f.pestana ?? ''),
    quincenaDesde: fecha(f.quincena_desde),
    quincenaHasta: fecha(f.quincena_hasta),
    porBanco: numero(f.por_banco),
    yaTransferido: numero(f.ya_transferido),
  }))
  const liquidacion: LineaDeLiquidacion[] = ((liq.data ?? []) as Record<string, unknown>[]).flatMap((f) => {
    const q = (Array.isArray(f.liquidacion_quincena) ? f.liquidacion_quincena[0] : f.liquidacion_quincena) as
      { desde?: string; hasta?: string } | null
    if (!q?.desde || !q.hasta) return []
    return [{ desde: fecha(q.desde), hasta: fecha(q.hasta), porBanco: numero(f.por_banco), pagadoBanco: numero(f.pagado_banco) }]
  })
  return armarHaberesDelBanco({ puedeVer: true, anio: p.anio, acreditaciones, planilla, liquidacion, errores })
}
