// M05 · LA BANDEJA DE CORRECCIONES DE ASISTENCIA — lo que Administración tiene que resolver.
//
// Lee `correccion_asistencia_bandeja`, la vista `security_invoker = true` que le pega el nombre de
// la persona al pedido y trae las dos puntas del día. Acá NO se filtra por rol: quién ve qué lo
// decide la policy de `solicitud_correccion_asistencia` en la base, y eso vale también para una
// llamada directa a PostgREST que no pasa por ninguna pantalla.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '@/features/auth/services/authService'

export const MIGRACION = '20260821T5500_la_salida_que_falta_se_pide_y_la_aprueba_administracion'

export type EstadoCorreccion = 'pendiente' | 'aprobada' | 'rechazada'

export interface CorreccionEnBandeja {
  id: string
  persona_id: string
  nombre_completo: string
  fecha: string
  tipo: 'entrada' | 'salida'
  hora_propuesta: string
  motivo: string
  estado: EstadoCorreccion
  nota_resolucion: string | null
  resuelta_en: string | null
  marca_id: string | null
  creado_en: string
  entrada: string | null
  salida: string | null
}

/** `42P01` (la tabla no existe) y el error de caché de esquema de PostgREST significan lo mismo acá:
 *  la migración no está aplicada. Se dice con el NOMBRE del archivo — una bandeja vacía se leería
 *  como «nadie pidió nada», que es una afirmación distinta y falsa. */
function faltaLaTabla(error: { code?: string; message: string }): boolean {
  return error.code === '42P01'
    || /relation .* does not exist|could not find the table|schema cache/i.test(error.message)
}

export async function getCorrecciones(
  supabase: SupabaseClient, estado: EstadoCorreccion,
): Promise<ServiceResult<CorreccionEnBandeja[]>> {
  const { data, error } = await supabase
    .from('correccion_asistencia_bandeja')
    .select('*')
    .eq('estado', estado)
    // Las pendientes, la más vieja arriba: lo que lleva más tiempo esperando es lo que más urge.
    // Las resueltas, al revés: ahí lo que se consulta es lo último que se hizo.
    .order('creado_en', { ascending: estado === 'pendiente' })
    .limit(200)

  if (error) {
    if (faltaLaTabla(error)) {
      return {
        data: null,
        error: `Todavía no puedo leer los pedidos de corrección: falta aplicar en la base la migración ${MIGRACION}.`,
      }
    }
    return { data: null, error: error.message }
  }
  return { data: (data as CorreccionEnBandeja[] | null) ?? [], error: null }
}
