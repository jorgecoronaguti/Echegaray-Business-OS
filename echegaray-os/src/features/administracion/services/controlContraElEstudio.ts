// EL SERVIDOR NO LE CREE AL CLIENTE QUE EL BANCO COINCIDE CON EL RECIBO DEL ESTUDIO.
//
// Auditoría 02/10/2026: el freno de «estimado» dependía de una bandera que armaba la pantalla y que el esquema de
// entrada descartaba: un estimado se sellaba y se numeraba igual. Acá el servidor mira el dato él mismo —el neto del
// estudio en `nomina_recibo_neto` y la resta en `liquidacion_arrastre`— y decide. Un control no se valida contra la
// misma información que produce: el papel dice «banco $X»; el estudio dice cuánto es el neto.

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { arrastreYaIncluido, type RecibosDelEstudio } from './recibosDelEstudio.ts'
import { leerModalidadDeCobro, leerRecibosDelEstudio } from './recibosDelEstudioService.ts'
import { quincenaDeOrigen } from './reciboDeLaQuincena.ts'
import type { ReciboSellado } from './reciboEmitido.ts'

const r2 = (n: number) => Math.round(n * 100) / 100
const pesos = (n: number) => `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Función pura: por qué NO se puede emitir, o `null`. `banco` es el depósito que dice el papel; `null` = el papel no lo
 * lleva. `netoDelEstudio` es el de la quincena (quincenal) o la SUMA de los dos recibos del mes (mensual, dueño
 * 02/10/2026). Si al mensual le falta uno de los dos recibos y el otro ya llegó, no se emite aunque el papel no lleve
 * banco: se dice cuál falta (`faltan`) y no se asume cero.
 */
export function motivoContraElEstudio(d: {
  nombre: string; estimado: boolean; banco: number | null; netoDelEstudio: number | null; arrastre: number
  mensual?: boolean; faltan?: readonly string[]; cargados?: number
}): string | null {
  const faltan = d.faltan ?? []
  if (d.mensual && faltan.length > 0 && (d.cargados ?? 0) > 0) {
    return `A ${d.nombre} se le paga por mes con los dos recibos del estudio y falta el de la ${faltan.map(quincenaDeOrigen).join(' y el de la ')}: no se emite hasta que llegue.`
  }
  // SIN DEPÓSITO EN BANCO NO HAY RECIBO DEL ESTUDIO QUE COTEJAR (todo en efectivo, finales, subcontratados).
  if (d.banco == null || Math.abs(d.banco) < 0.005) return null
  if (d.estimado || d.netoDelEstudio == null) {
    const cual = d.mensual && faltan.length > 0 ? `${faltan.length > 1 ? 'los recibos' : 'el recibo'} de la ${faltan.map(quincenaDeOrigen).join(' y la ')}` : 'el recibo del estudio de esta quincena'
    return `Todavía no llegó ${cual} para ${d.nombre}: el recibo se puede ver como estimado, pero no se emite.`
  }
  const residuo = r2(d.banco - d.arrastre - d.netoDelEstudio)
  if (residuo === 0) return null
  return `El depósito en banco de ${d.nombre} (${pesos(d.banco)}) no coincide con ${d.mensual ? 'los dos recibos' : 'el recibo'} del estudio (${pesos(d.netoDelEstudio)}`
    + `${d.arrastre > 0 ? ` + saldo ${pesos(d.arrastre)}` : ''}): diferencia ${pesos(residuo)}. Revisalo antes de emitir.`
}

const FilaArrastre = z.object({ importe: z.coerce.number().finite().positive(), periodo_origen: z.string().default('') })

/** Lo que el banco ya trae adentro no es resta: el recibo de la 1ª quincena de un mensual está en su suma (`arrastreYaIncluido`). */
function arrastreReal(filas: unknown[], estudio: RecibosDelEstudio): number {
  const incluidos = estudio.modalidad === 'mensual' ? estudio.periodos : []
  return r2(filas.reduce<number>((a, x) => {
    const f = FilaArrastre.safeParse(x)
    return a + (f.success && !arrastreYaIncluido(f.data.periodo_origen, incluidos) ? f.data.importe : 0)
  }, 0))
}

/** Lee del estudio y de los arrastres, y decide. Si no puede leer, NO deja emitir: un control que no mira no aprueba. */
export async function verificarContraElEstudio(supabase: SupabaseClient, r: ReciboSellado): Promise<string | null> {
  const sinBanco = r.banco == null || Math.abs(r.banco) < 0.005
  if (!sinBanco && r.estimado) return motivoContraElEstudio({ nombre: r.nombre, estimado: true, banco: r.banco, netoDelEstudio: null, arrastre: 0 })
  const noPude = `No pude verificar el recibo de ${r.nombre} contra el del estudio. No lo emití.`
  // SIN BANCO el único freno posible es el del mensual con un recibo del mes sin llegar; para el resto, como siempre:
  // quien cobra todo en efectivo emite, aunque la lectura de la modalidad falle.
  if (sinBanco && (await leerModalidadDeCobro(supabase, r.personaId, r.quincenaHasta)) !== 'mensual') return null
  const [per, arr, modalidad] = await Promise.all([
    supabase.from('persona_legajo').select('cuil').eq('id', r.personaId).maybeSingle(),
    supabase.from('liquidacion_arrastre').select('importe, periodo_origen').eq('persona_id', r.personaId).eq('desde', r.quincenaDesde),
    leerModalidadDeCobro(supabase, r.personaId, r.quincenaHasta),
  ])
  if (per.error || arr.error || modalidad == null) return noPude
  const cuil = typeof per.data?.cuil === 'string' ? per.data.cuil : null
  const estudio = await leerRecibosDelEstudio(supabase, { cuil, modalidad, desde: r.quincenaDesde })
  if (!estudio) return noPude
  return motivoContraElEstudio({
    nombre: r.nombre, estimado: false, banco: r.banco, netoDelEstudio: estudio.total, arrastre: arrastreReal(arr.data ?? [], estudio),
    mensual: modalidad === 'mensual', faltan: estudio.faltan, cargados: estudio.recibos.length,
  })
}
