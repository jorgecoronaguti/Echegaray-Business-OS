import { createClient } from '@/lib/supabase/server'
import { SubNavTrabajo } from '../SubNavTrabajo'

// 04c · TRABAJO · PLANILLA (diseño ERP Obras, 23/09/2026) — tarea × día hábil con la fracción de cada
// parte. Fuente: función `planilla_obra(obra, desde, hasta)` (migración 20260923T2310).
//
// ANCLAJE: esta primera versión sólo enlaza la sub y lee las filas; la grilla del diseño (toolbar con
// rango de dos semanas hábiles, toggles Fracción · Cantidad · Quién, columnas de 76 px por día,
// impresión A4 apaisada) se construye en el hito H6.
export async function TabPlanilla({ obraId }: { obraId: string }) {
  const supabase = await createClient()
  const hoy = new Date()
  const desde = new Date(hoy); desde.setDate(hoy.getDate() - 13)
  const { data, error } = await supabase.rpc('planilla_obra', {
    p_obra_id: obraId, p_desde: desde.toISOString().slice(0, 10), p_hasta: hoy.toISOString().slice(0, 10),
  })
  const filas = (data ?? []) as { actividad_id: string; fecha: string; fraccion: number | null; n_partes: number }[]
  return (
    <>
      <SubNavTrabajo obraId={obraId} sub="planilla" />
      <div className="px-5 py-4 text-[12.5px] text-muted" data-testid="planilla-obra">
        {error ? `No se pudo leer la planilla: ${error.message}` : `${filas.length} celdas con parte en las últimas dos semanas.`}
      </div>
    </>
  )
}
