// LA LECTURA DE LAS RESTITUCIONES DE PRESENTISMO de una quincena (tabla `liquidacion_presentismo_restitucion`).
//
// Módulo aparte para no seguir engordando `liquidacionQuincenaService.ts`. Tolera que la migración no esté aplicada:
// sin tabla devuelve un mapa vacío y la pantalla queda como estaba (nadie pudo restituir), pero cualquier OTRO error
// se dice: leer «ninguna restitución» cuando la lectura falló volvería a mostrar «perdido» a quien ya se le perdonó.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { RestitucionDePresentismo } from './presentismo.ts'

const sinTabla = (e: { code?: string; message: string }): boolean =>
  e.code === '42P01' || /does not exist|could not find the table/i.test(e.message)

export async function leerRestituciones(
  supabase: SupabaseClient, desde: string, hasta: string,
): Promise<{ porPersona: Map<string, RestitucionDePresentismo>; error: { message: string } | null }> {
  const porPersona = new Map<string, RestitucionDePresentismo>()
  const { data, error } = await supabase.from('liquidacion_presentismo_restitucion')
    .select('persona_id, fechas, motivo, restituido_por_nombre, restituido_en').eq('desde', desde).eq('hasta', hasta).is('deshecho_en', null)
  if (error) return { porPersona, error: sinTabla(error) ? null : { message: error.message } }
  for (const f of (data ?? []) as { persona_id: string; fechas: string[]; motivo: string | null; restituido_por_nombre: string; restituido_en: string }[]) {
    porPersona.set(f.persona_id, {
      por: f.restituido_por_nombre, en: f.restituido_en, motivo: f.motivo,
      fechas: (f.fechas ?? []).map((x) => String(x).slice(0, 10)),
    })
  }
  return { porPersona, error: null }
}
