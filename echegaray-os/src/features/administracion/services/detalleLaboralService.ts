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
import { periodoDeRecibo, type FilaRecibo } from './liquidacionCuadros.ts'

export async function leerDetallesLaborales(
  supabase: SupabaseClient, cuadro: CuadroDeLaQuincena, quincena: Quincena,
): Promise<{ detalles: Record<string, DetalleLaboral>; errores: { que: string; error: string }[] }> {
  const periodo = periodoDeRecibo(quincena)
  const [{ alicuotas, errores }, recibos, jornal] = await Promise.all([
    getAlicuotas(supabase),
    // Más nuevo primero: `fechaDePagoDe` toma la última carga del recibo.
    supabase.from('nomina_recibo_neto').select('cuil, periodo, neto, fecha_pago')
      .eq('periodo', periodo).order('cargado_en', { ascending: false }),
    // Sólo lo liquidado: la fila «proyeccion» es un supuesto de caja, no un pago.
    supabase.from('jornal_quincena').select('fecha_pago')
      .eq('desde', quincena.desde).eq('hasta', quincena.hasta).eq('clase', 'real').maybeSingle(),
  ])
  // Una lectura caída NO es «sin fecha»: se avisa; el papel igual dice «—» y no escribe una inventada.
  const fallas = [...errores]
  if (recibos.error) fallas.push({ que: 'la fecha de pago del recibo', error: recibos.error.message })
  if (jornal.error) fallas.push({ que: 'la fecha de pago de la quincena', error: jornal.error.message })
  const multiplicador = multiplicadorDeCosto(alicuotasVigentes(alicuotas, quincena.hasta), 1).valor
  const pagos = {
    periodo,
    recibos: (recibos.data ?? []) as FilaRecibo[],
    jornalFechaPago: (jornal.data as { fecha_pago: string | null } | null)?.fecha_pago ?? null,
  }
  return { detalles: detallesLaboralesDeLaQuincena(cuadro, multiplicador, pagos), errores: fallas }
}
