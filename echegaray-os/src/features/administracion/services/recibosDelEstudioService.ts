// LA LECTURA DEL SERVIDOR PARA `recibosDelEstudio`: quién cobra por mes y qué recibos del estudio tiene en el mes.
//
// El control de emisión y la reimpresión corren en el servidor y NO reciben la modalidad del cliente (un control no se
// valida contra lo que dice quien lo pide). La deciden con la misma regla del cuadro: `cobraPorMes` (jefe de obra por
// puesto, o neto mensual vigente), sobre `persona_directorio` y `persona_tarifa`.

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { cobraPorMes } from './cobroMensual.ts'
import { cuilNormalizado } from './cuil.ts'
import { esJefeDeObra } from './vocabularioPersona.ts'
import { recibosDelEstudio, type ModalidadDeCobro, type RecibosDelEstudio } from './recibosDelEstudio.ts'

const FilaNeto = z.object({ cuil: z.string().nullable(), periodo: z.string(), neto: z.coerce.number().finite() })
const FilaTarifa = z.object({ desde: z.string(), neto_mensual: z.coerce.number().finite().nullable() })

/** `null` = no se pudo leer: quien llama no emite (un control que no mira no aprueba). */
export async function leerModalidadDeCobro(supabase: SupabaseClient, personaId: string, hasta: string): Promise<ModalidadDeCobro | null> {
  const [dir, tar] = await Promise.all([
    supabase.from('persona_directorio').select('puesto').eq('id', personaId).maybeSingle(),
    supabase.from('persona_tarifa').select('desde, neto_mensual').eq('persona_id', personaId).lte('desde', hasta),
  ])
  if (dir.error || tar.error) return null
  const puesto = typeof dir.data?.puesto === 'string' ? dir.data.puesto : null
  let vigente: { desde: string; neto: number | null } | null = null
  for (const crudo of tar.data ?? []) {
    const f = FilaTarifa.safeParse(crudo)
    if (f.success && (!vigente || f.data.desde > vigente.desde)) vigente = { desde: f.data.desde, neto: f.data.neto_mensual }
  }
  return cobraPorMes({ esJefe: esJefeDeObra(puesto), netoMensual: vigente?.neto ?? null }) ? 'mensual' : 'quincenal'
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
