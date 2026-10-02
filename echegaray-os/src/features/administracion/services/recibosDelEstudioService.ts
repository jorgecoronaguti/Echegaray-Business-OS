// LA LECTURA DEL SERVIDOR PARA `recibosDelEstudio`: quién cobra por mes y qué recibos del estudio tiene en el mes.
//
// El control de emisión y la reimpresión corren en el servidor y NO reciben la modalidad del cliente (un control no se
// valida contra lo que dice quien lo pide). La deciden con la misma regla del cuadro, `modalidadDeCobroAl`: el neto
// mensual de `persona_tarifa` vigente a ESA quincena. No el puesto: un jefe de agosto cobraba por hora (dueño, 02/10).

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { cuilNormalizado } from './cuil.ts'
import { modalidadDeCobroAl, recibosDelEstudio, type ModalidadDeCobro, type RecibosDelEstudio } from './recibosDelEstudio.ts'

const FilaNeto = z.object({ cuil: z.string().nullable(), periodo: z.string(), neto: z.coerce.number().finite() })
const FilaTarifa = z.object({ desde: z.string(), neto_mensual: z.coerce.number().finite().nullable() })

/**
 * La modalidad de cada quincena de la persona: una función de `hasta`, porque un recibo de agosto y uno de septiembre
 * de la misma persona no tienen la misma. `null` = no se pudo leer: quien llama no emite (un control que no mira no aprueba).
 */
export async function leerModalidadesDeCobro(
  supabase: SupabaseClient, personaId: string,
): Promise<((hasta: string) => ModalidadDeCobro) | null> {
  const tar = await supabase.from('persona_tarifa').select('desde, neto_mensual').eq('persona_id', personaId)
  if (tar.error) return null
  const tarifas = (tar.data ?? []).flatMap((crudo) => {
    const f = FilaTarifa.safeParse(crudo)
    return f.success ? [{ desde: f.data.desde, netoMensual: f.data.neto_mensual }] : []
  })
  return (hasta) => modalidadDeCobroAl(tarifas, hasta)
}

/** La modalidad que rige a la quincena que termina en `hasta`. `null` = no se pudo leer. */
export async function leerModalidadDeCobro(supabase: SupabaseClient, personaId: string, hasta: string): Promise<ModalidadDeCobro | null> {
  const al = await leerModalidadesDeCobro(supabase, personaId)
  return al ? al(hasta) : null
}

/** Los recibos del estudio de la persona para esa quincena, según su modalidad. `null` = la lectura falló. */
export async function leerRecibosDelEstudio(
  supabase: SupabaseClient, d: { cuil: string | null; modalidad: ModalidadDeCobro; desde: string },
): Promise<RecibosDelEstudio | null> {
  if (!d.cuil) return recibosDelEstudio({ ...d, filas: [] })
  const { data, error } = await supabase.from('nomina_recibo_neto').select('cuil, periodo, neto')
    .in('cuil', [...new Set([d.cuil, cuilNormalizado(d.cuil) ?? d.cuil])])
  if (error) return null
  const filas = (data ?? []).flatMap((x) => { const f = FilaNeto.safeParse(x); return f.success ? [f.data] : [] })
  return recibosDelEstudio({ ...d, filas })
}
