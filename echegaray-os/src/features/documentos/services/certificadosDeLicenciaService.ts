// LOS CERTIFICADOS MÉDICOS QUE TOCAN UNA VENTANA — la lectura para el clip de las grillas.
//
// La grilla de asistencia y la franja de la quincena dibujan un día de licencia; con esto saben si
// ese día tiene un papel detrás. Es una sola lectura por ventana, filtrada por el índice parcial
// `entidad_documento_certificado_rango_idx`, y el cruce por día lo hace `certificadoDeLicencia.ts`.
//
// SI LA COLUMNA TODAVÍA NO EXISTE (migración 20260916T0100 sin aplicar), la lectura devuelve la
// lista vacía sin error: la grilla se dibuja exactamente como antes, sin clip. No es un dato
// perdido: nadie pudo cargar un certificado sin la columna.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CertificadoVigente } from './certificadoDeLicencia'

export type CertificadoDePersona = CertificadoVigente & { persona_id: string }

export async function getCertificadosDeLicencia(
  supabase: SupabaseClient,
  ventana: { desde: string; hasta: string },
  personaId?: string,
): Promise<{ data: CertificadoDePersona[]; error: string | null }> {
  let q = supabase.from('entidad_documento')
    .select('entidad_id, nombre_archivo, licencia_desde, licencia_hasta')
    .eq('entidad_tipo', 'persona').eq('categoria', 'certificado_medico')
    .is('eliminado_en', null)
    // SOLAPAMIENTO DE RANGOS: empieza antes de que termine la ventana y termina después de que empiece.
    .lte('licencia_desde', ventana.hasta).gte('licencia_hasta', ventana.desde)
  if (personaId) q = q.eq('entidad_id', personaId)
  const { data, error } = await q
  if (error) {
    const sinColumna = error.code === '42703' || error.code === 'PGRST204' || /licencia_desde|does not exist|schema cache/i.test(error.message)
    return { data: [], error: sinColumna ? null : error.message }
  }
  return {
    data: ((data ?? []) as { entidad_id: string; nombre_archivo: string; licencia_desde: string; licencia_hasta: string }[])
      .map((f) => ({ persona_id: f.entidad_id, nombre: f.nombre_archivo, desde: f.licencia_desde, hasta: f.licencia_hasta })),
    error: null,
  }
}
