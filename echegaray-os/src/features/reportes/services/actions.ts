'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { GENERADORES } from './generadores'

export type GenerarReporteState = { error: string | null }

// Generación on-demand: corre el generador de la definición, publica en el
// historial (reportes_generados) y revalida /reportes. RLS decide quién puede
// (direccion/administracion/operaciones). Canal fijo 'os' en esta etapa: los
// envíos externos están prohibidos sin configuración y autorización (skill
// reportes-automaticos-y-comunicaciones).
export async function generarReporteAction(
  _prev: GenerarReporteState,
  formData: FormData,
): Promise<GenerarReporteState> {
  const clave = String(formData.get('clave') ?? '')
  const definicionId = String(formData.get('definicion_id') ?? '')
  const generador = GENERADORES[clave]
  if (!generador || !definicionId) return { error: `No existe generador para "${clave}".` }

  const supabase = await createClient()
  try {
    const resultado = await generador(supabase)
    const { error } = await supabase.from('reportes_generados').insert({
      definicion_id: definicionId,
      periodo_desde: resultado.periodo_desde,
      periodo_hasta: resultado.periodo_hasta,
      contenido: resultado.contenido,
      confianza: resultado.confianza,
      fuentes_usadas: resultado.fuentes_usadas,
      canal: 'os',
      estado_entrega: 'publicado',
      generado_por: 'on-demand',
    })
    if (error) return { error: `No se pudo publicar el reporte: ${error.message}` }
  } catch (e) {
    return { error: `Falló la generación: ${e instanceof Error ? e.message : String(e)}` }
  }
  revalidatePath('/reportes')
  return { error: null }
}
