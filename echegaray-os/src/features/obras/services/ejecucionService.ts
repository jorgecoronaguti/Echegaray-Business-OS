// EJECUCIÓN — la lectura de los partes diarios.
//
// El acumulado por actividad NO se suma acá: lo publica `obra_actividad_control`, que es de donde
// salen el avance, la producción acumulada y la productividad. Esto devuelve el DETALLE —qué se
// cargó cada día— para que el número de arriba se pueda auditar y para que un error de carga se
// pueda encontrar y borrar.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParteEjecucion, ServiceResult } from '../types'

/** Los partes de la obra, del más nuevo al más viejo. Con `actividadId`, los de esa actividad. */
export async function getPartes(
  supabase: SupabaseClient, obraId: string, actividadId?: string,
): Promise<ServiceResult<ParteEjecucion[]>> {
  const base = supabase.from('obra_ejecucion')
    .select('id, obra_id, actividad_id, fecha, cantidad, avance_pct, comentario, fuente, creado_en')
    .eq('obra_id', obraId)
  const { data, error } = await (actividadId ? base.eq('actividad_id', actividadId) : base)
    .order('fecha', { ascending: false })
    .order('creado_en', { ascending: false })
    .limit(400)
  if (error) return { data: null, error: error.message }
  return {
    data: (data ?? []).map((p) => {
      const f = p as ParteEjecucion
      return { ...f, cantidad: f.cantidad === null ? null : Number(f.cantidad),
        avance_pct: f.avance_pct === null ? null : Number(f.avance_pct) }
    }),
    error: null,
  }
}

/** Lo cargado HOY por actividad. Es la columna «hoy» de la pantalla de Ejecución: lo que se movió
 *  en la jornada que se está cargando, no el acumulado. */
export function deHoy(partes: ParteEjecucion[], fecha: string): Map<string, { cantidad: number; pct: number }> {
  const m = new Map<string, { cantidad: number; pct: number }>()
  for (const p of partes) {
    if (p.fecha !== fecha) continue
    const a = m.get(p.actividad_id) ?? { cantidad: 0, pct: 0 }
    m.set(p.actividad_id, { cantidad: a.cantidad + (p.cantidad ?? 0), pct: a.pct + (p.avance_pct ?? 0) })
  }
  return m
}
