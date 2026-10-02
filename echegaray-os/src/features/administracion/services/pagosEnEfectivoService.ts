// LEER LOS PAGOS EN EFECTIVO DE UNA QUINCENA (`liquidacion_pago_efectivo`), SI LA TABLA EXISTE.
//
// Sirve al detalle de la celda «Pagado en efectivo»: el día en que salió cada pago y su nota. La tabla nace con la
// migración 20261002T1800, que se aplica aparte: hasta entonces la pantalla tiene que andar igual. Sin tabla se
// contesta `null` y el detalle no afirma ningún día de pago.
//
// LA RLS ES LA PUERTA (`liquida_sueldos()`): quien no liquida lee cero filas, y el punto sólo se dibuja ante quien liquida.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PagoEfectivoCrudo } from './detalleDePagoEnEfectivo.ts'

const COLUMNAS = 'liquidacion_id, persona_id, grupo, fecha, importe, origen, registrado_por, registrado_en, clave, nota'

/**
 * `null` = no hay tabla o no se pudo leer. Una quincena tiene a lo sumo unas pocas decenas de filas (una por cambio de
 * lo pagado), muy lejos del corte de PostgREST: una sola página alcanza.
 */
export async function leerPagosEnEfectivo(supabase: SupabaseClient, desde: string): Promise<PagoEfectivoCrudo[] | null> {
  try {
    const r = await supabase.from('liquidacion_pago_efectivo').select(COLUMNAS)
      .eq('quincena_desde', desde).order('registrado_en', { ascending: true }).limit(1000)
    // Tabla sin aplicar (42P01 / PGRST205) o cualquier otro fallo de lectura: en los dos casos no hay día de pago que afirmar.
    if (r.error) return null
    return (r.data ?? []) as PagoEfectivoCrudo[]
  } catch {
    return null
  }
}
