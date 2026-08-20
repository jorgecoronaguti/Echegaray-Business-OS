// LOS INSUMOS DEL CHECKLIST, LEÍDOS DE LA BASE. La aritmética no está acá: está en `preparacion.ts`,
// que es puro y tiene su prueba. Acá sólo se traen las filas.
//
// ═══ POR QUÉ EL CONTRATO SE LEE DE `obra_panel` Y NO DE `obra_canonica` ═══
//
// `obra_canonica.monto_contratado` es la columna cruda: su RLS decide QUÉ FILAS se ven, no qué
// columnas. Leer de la tabla le entregaría el monto contratado a un jefe de obra por la puerta de
// atrás, que es exactamente la fuga que `20260819T0400` cerró en las vistas. `obra_panel` enmascara
// la columna en Postgres, así que lo peor que puede pasar acá es que llegue NULL — y el NULL nunca
// se interpreta, porque la línea de Contrato no se arma para quien no es Administración.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActividadPreparacion, InsumosPreparacion } from './preparacion'

export interface LecturaPreparacion {
  insumos: InsumosPreparacion | null
  error: string | null
}

/**
 * Tres consultas y ninguna cuenta: el panel de la obra, sus actividades y cuánta gente tiene
 * asignada. Las actividades se traen con seis columnas y se cuentan en memoria porque los cinco
 * conteos que hacen falta son sobre la MISMA población y con condiciones distintas: pedirlos por
 * separado serían cinco viajes que pueden contradecirse entre sí si alguien escribe en el medio.
 *
 * LÍMITE DECLARADO: si una obra superara el tope de filas que devuelve PostgREST en una lectura, las
 * fracciones se calcularían sobre una muestra y dirían de menos. La obra más grande hoy tiene 344
 * actividades (medido el 19/08/2026); si alguna llegara al orden del millar, esto pasa a conteos
 * agregados en la base.
 */
export async function getPreparacion(
  supabase: SupabaseClient,
  obraId: string,
  verContrato: boolean,
): Promise<LecturaPreparacion> {
  const [panel, actividades, asignaciones] = await Promise.all([
    supabase
      .from('obra_panel')
      .select('jefe_obra, monto_contratado, fecha_inicio_plan, fecha_fin_plan, drive_carpeta_id')
      .eq('obra_id', obraId)
      .maybeSingle(),
    supabase
      .from('obra_actividad')
      .select('archivada, inicio_plan, fin_plan, inicio_base, fin_base, responsable_id, hh_plan')
      .eq('obra_id', obraId),
    supabase
      .from('obra_asignacion')
      .select('id', { count: 'exact', head: true })
      .eq('obra_id', obraId),
  ])

  if (panel.error) return { insumos: null, error: panel.error.message }
  if (!panel.data) return { insumos: null, error: `No existe la obra "${obraId}"` }
  if (actividades.error) return { insumos: null, error: actividades.error.message }
  if (asignaciones.error) return { insumos: null, error: asignaciones.error.message }

  const o = panel.data as Record<string, unknown>
  return {
    insumos: {
      obraId,
      jefeObra: (o.jefe_obra as string) ?? null,
      montoContratado: (o.monto_contratado as number) ?? null,
      inicioPlan: (o.fecha_inicio_plan as string) ?? null,
      finPlan: (o.fecha_fin_plan as string) ?? null,
      driveCarpetaId: (o.drive_carpeta_id as string) ?? null,
      actividades: (actividades.data ?? []) as unknown as ActividadPreparacion[],
      personasAsignadas: asignaciones.count ?? 0,
      verContrato,
    },
    error: null,
  }
}
