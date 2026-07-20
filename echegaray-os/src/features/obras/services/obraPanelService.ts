import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from './obrasService'

// CARTERA REAL DE OBRAS — lee `public.obra_panel`, la fuente única que comparten chat y web.
//
// Por qué existe: la web listaba obras desde `public.obras` (registro legacy), donde las 4 filas
// están pausadas o cerradas. Las obras REALMENTE en ejecución (ARCOR, La Estrella, San Francisco,
// Messina) viven en el eje canónico y NO existían para la pantalla: La Estrella, con $168,7M de
// costo real, era invisible para el dueño. El chat las veía y la web no — dos universos distintos
// del mismo negocio, que es exactamente lo que la regla de fuente única prohíbe.
//
// No reemplaza a getObras(): esa sigue sirviendo a los formularios y selects que necesitan el id
// legacy (uuid) y sus campos obligatorios. Esta responde otra pregunta: "¿qué obras tengo hoy?".
export interface ObraPanel {
  obra_id: string
  obra_nombre: string
  estado: string
  tipo: string
  costo_real: number
  n_comprobantes: number
  monto_contratado: number | null
  fecha_inicio: string | null
  fecha_fin_objetivo: string | null
  /** Sólo se calcula cuando hay contratado Y costo real. NULL = falta un lado, no "0% de margen". */
  margen_sobre_contratado_pct: number | null
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v))
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

export async function getObrasPanel(supabase: SupabaseClient): Promise<ServiceResult<ObraPanel[]>> {
  try {
    const { data, error } = await supabase
      .from('obra_panel')
      .select('*')
      .order('costo_real', { ascending: false })
    if (error) return { data: null, error: error.message }
    const filas = (data ?? []).map((r: Record<string, unknown>) => ({
      obra_id: String(r.obra_id),
      obra_nombre: String(r.obra_nombre),
      estado: String(r.estado ?? ''),
      tipo: String(r.tipo ?? ''),
      costo_real: num(r.costo_real),
      n_comprobantes: num(r.n_comprobantes),
      monto_contratado: numOrNull(r.monto_contratado),
      fecha_inicio: r.fecha_inicio ? String(r.fecha_inicio) : null,
      fecha_fin_objetivo: r.fecha_fin_objetivo ? String(r.fecha_fin_objetivo) : null,
      margen_sobre_contratado_pct: numOrNull(r.margen_sobre_contratado_pct),
    }))
    return { data: filas, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase' }
  }
}

/** Activas primero, y dentro de cada grupo la de mayor costo real arriba. PURA. */
export function ordenarCartera(obras: ObraPanel[]): ObraPanel[] {
  const peso = (e: string) => (e === 'activa' ? 0 : e === 'contratada' ? 1 : e === 'pausada' ? 2 : 3)
  return [...obras].sort((a, b) => peso(a.estado) - peso(b.estado) || b.costo_real - a.costo_real)
}
