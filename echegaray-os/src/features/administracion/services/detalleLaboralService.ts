// LA LECTURA DEL DETALLE LABORAL: el multiplicador de cargas y el armado sobre el cuadro ya leído.
//
// El multiplicador es el mismo que usaba «Horas» y usa «Costo a la obra»
// (`multiplicadorDeCosto(alicuotasVigentes(…, hasta), 1)`): dos definiciones de «cuánto cuesta esta
// hora» darían dos costos de obra.

import type { SupabaseClient } from '@supabase/supabase-js'
import { alicuotasVigentes, multiplicadorDeCosto } from './costoHora.ts'
import { getAlicuotas } from './costoLecturas.ts'
import type { CuadroDeLaQuincena } from './cuadroDeLaQuincenaService.ts'
import { detallesLaboralesDeLaQuincena, type DetalleLaboral } from './detalleLaboral.ts'
import type { Quincena } from './quincena.ts'

export async function leerDetallesLaborales(
  supabase: SupabaseClient, cuadro: CuadroDeLaQuincena, quincena: Quincena,
): Promise<{ detalles: Record<string, DetalleLaboral>; errores: { que: string; error: string }[] }> {
  const { alicuotas, errores } = await getAlicuotas(supabase)
  const multiplicador = multiplicadorDeCosto(alicuotasVigentes(alicuotas, quincena.hasta), 1).valor
  return { detalles: detallesLaboralesDeLaQuincena(cuadro, multiplicador), errores }
}
