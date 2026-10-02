// EL SERVIDOR NO LE CREE AL CLIENTE QUE EL BANCO COINCIDE CON EL RECIBO DEL ESTUDIO.
//
// Auditoría 02/10/2026: el freno de «estimado» dependía de una bandera que armaba la pantalla y que el esquema de
// entrada descartaba: un estimado se sellaba y se numeraba igual. Acá el servidor mira el dato él mismo —el neto del
// estudio en `nomina_recibo_neto` y la resta en `liquidacion_arrastre`— y decide. Un control no se valida contra la
// misma información que produce: el papel dice «banco $X»; el estudio dice cuánto es el neto.

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { cuilNormalizado, mismoCuil } from './cuil.ts'
import type { ReciboSellado } from './reciboEmitido.ts'

const r2 = (n: number) => Math.round(n * 100) / 100
const pesos = (n: number) => `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** `2026-09-16` → `Q2-09/2026`, la clave de período del estudio. */
export const periodoDelEstudio = (desde: string) => `Q${Number(desde.slice(8, 10)) === 1 ? 1 : 2}-${desde.slice(5, 7)}/${desde.slice(0, 4)}`

/** Función pura: por qué NO se puede emitir, o `null`. `banco` es el depósito que dice el papel; `null` = el papel no lo lleva. */
export function motivoContraElEstudio(d: {
  nombre: string; estimado: boolean; banco: number | null; netoDelEstudio: number | null; arrastre: number
}): string | null {
  if (d.estimado || (d.banco != null && d.netoDelEstudio == null)) {
    return `Todavía no llegó el recibo del estudio de esta quincena para ${d.nombre}: el recibo se puede ver como estimado, pero no se emite.`
  }
  if (d.banco == null || d.netoDelEstudio == null) return null
  const residuo = r2(d.banco - d.arrastre - d.netoDelEstudio)
  if (residuo === 0) return null
  return `El depósito en banco de ${d.nombre} (${pesos(d.banco)}) no coincide con el recibo del estudio (${pesos(d.netoDelEstudio)}`
    + `${d.arrastre > 0 ? ` + saldo ${pesos(d.arrastre)}` : ''}): diferencia ${pesos(residuo)}. Revisalo antes de emitir.`
}

const FilaNeto = z.object({ cuil: z.string().nullable(), periodo: z.string(), neto: z.coerce.number().finite() })
const FilaArrastre = z.object({ importe: z.coerce.number().finite().positive() })

/** Lee del estudio y de los arrastres, y decide. Si no puede leer, NO deja emitir: un control que no mira no aprueba. */
export async function verificarContraElEstudio(supabase: SupabaseClient, r: ReciboSellado): Promise<string | null> {
  if (r.estimado) return motivoContraElEstudio({ nombre: r.nombre, estimado: true, banco: r.banco, netoDelEstudio: null, arrastre: 0 })
  if (r.banco == null) return null
  const noPude = `No pude verificar el recibo de ${r.nombre} contra el del estudio. No lo emití.`
  const [per, arr] = await Promise.all([
    supabase.from('persona_legajo').select('cuil').eq('id', r.personaId).maybeSingle(),
    supabase.from('liquidacion_arrastre').select('importe').eq('persona_id', r.personaId).eq('desde', r.quincenaDesde),
  ])
  if (per.error || arr.error) return noPude
  const cuil = typeof per.data?.cuil === 'string' ? per.data.cuil : null
  let neto: number | null = null
  if (cuil) {
    const { data, error } = await supabase.from('nomina_recibo_neto').select('cuil, periodo, neto')
      .in('cuil', [...new Set([cuil, cuilNormalizado(cuil) ?? cuil])])
    if (error) return noPude
    const periodo = periodoDelEstudio(r.quincenaDesde)
    for (const x of data ?? []) {
      const f = FilaNeto.safeParse(x)
      if (f.success && f.data.periodo === periodo && mismoCuil(f.data.cuil, cuil)) { neto = f.data.neto; break }
    }
  }
  const arrastre = r2((arr.data ?? []).reduce((a, x) => { const f = FilaArrastre.safeParse(x); return a + (f.success ? f.data.importe : 0) }, 0))
  return motivoContraElEstudio({ nombre: r.nombre, estimado: false, banco: r.banco, netoDelEstudio: neto, arrastre })
}
