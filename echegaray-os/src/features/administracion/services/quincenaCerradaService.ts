// LA QUINCENA CERRADA, CONTRA LA BASE. La regla vive en `quincenaCerrada.ts`; esto lee
// `liquidacion_quincena` y la aplica.
//
// NO ES `'use server'`: recibe el cliente de la sesión que ya abrió la acción, igual que
// `vaciadoDeHorasService.ts`, y así la importan todas las puertas que escriben horas.
//
// ═══ FALLA CERRADO CUANDO LA BASE DICE QUE FALLÓ — Y ESE NO ES EL ÚNICO MODO DE FALLAR ═══
//
// Un error de lectura no escribe. Pero la policy `liquidacion_quincena_lee_admin` exige
// `liquida_sueldos()`, que excluye al jefe de obra: para él la lectura vuelve VACÍA y sin error, y
// la guarda no ve el cierre. Desde la app eso no se distingue de «no hay quincena cerrada». Se
// arregla en la base —un trigger sobre `registros_hh` o una función `security definer` que no
// dependa de quién lee—, no acá.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  MENSAJE_TRAMO_SIN_VERIFICAR, mensajeSinLectura, quincenasDelTramo, veredictoDeCierre,
  type FilaDeCierre,
} from './quincenaCerrada.ts'

/**
 * El mensaje a mostrar si alguna quincena de `fecha`…`hasta` está cerrada o no se pudo verificar;
 * `null` si se puede escribir.
 */
export async function quincenaCerrada(
  supabase: SupabaseClient, fecha: string, hasta: string = fecha,
): Promise<string | null> {
  const quincenas = quincenasDelTramo(fecha, hasta)
  if (quincenas === null) return MENSAJE_TRAMO_SIN_VERIFICAR
  const { data, error } = await supabase.from('liquidacion_quincena')
    .select('desde, hasta, estado').in('desde', quincenas.map((q) => q.desde))
  if (error) return mensajeSinLectura(error.message)
  return veredictoDeCierre(quincenas, (data ?? []) as FilaDeCierre[])
}
