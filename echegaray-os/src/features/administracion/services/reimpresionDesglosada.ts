// LA REIMPRESIÓN DE UN RECIBO YA EMITIDO, CON EL BANCO ABIERTO (dueño, 02/10/2026).
//
// Los RP de la Q2-09 se sellaron con «Depósito en banco» = neto del estudio + saldo del recibo de la Q1, en un solo
// renglón: no coincidía con el recibo del estudio. Lo sellado NO se toca (ni su número ni sus importes): se desglosa
// AL MOSTRAR, con el neto del estudio (`nomina_recibo_neto`) y el arrastre (`liquidacion_arrastre`) leídos de la base.
// Si alguna de las dos lecturas falla o las cuentas no cierran al centavo, el papel sale tal como se selló: sin
// migración y sin UPDATE, y sin inventar un desglose sobre un papel que la persona ya firmó.

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { mismoCuil, cuilNormalizado } from './cuil.ts'
import { desglosarBancoSellado, limpiarMediosSellados } from './reciboDeLaQuincena.ts'
import type { ReciboEnElLegajo } from './reciboEmitido.ts'

const FilaNeto = z.object({ cuil: z.string().nullable(), periodo: z.string(), neto: z.coerce.number().finite() })
const FilaArrastre = z.object({ desde: z.string(), importe: z.coerce.number().finite().positive(), periodo_origen: z.string() })

const r2 = (n: number) => Math.round(n * 100) / 100

/** `2026-09-16` → `Q2-09/2026`, la clave de período del estudio. */
const periodoDe = (desde: string) => `Q${Number(desde.slice(8, 10)) === 1 ? 1 : 2}-${desde.slice(5, 7)}/${desde.slice(0, 4)}`

/** Devuelve los mismos recibos con el banco desglosado donde las cuentas cierran. Ante un error de lectura, los deja como están. */
export async function conBancoDesglosado(supabase: SupabaseClient, personaId: string, crudos: ReciboEnElLegajo[]): Promise<ReciboEnElLegajo[]> {
  // PRIMERO LA LIMPIEZA, y siempre: los rótulos largos y las cuentas escritas junto a un importe no se reimprimen.
  const recibos = crudos.map((r) => {
    const medios = limpiarMediosSellados(r.renglones.medios)
    return medios.every((m, i) => m === r.renglones.medios[i]) ? r : { ...r, renglones: { ...r.renglones, medios } }
  })
  if (recibos.length === 0) return recibos
  const [arr, per] = await Promise.all([
    supabase.from('liquidacion_arrastre').select('desde, importe, periodo_origen').eq('persona_id', personaId),
    supabase.from('persona_legajo').select('cuil').eq('id', personaId).maybeSingle(),
  ])
  if (arr.error || per.error) return recibos
  const arrastres = new Map<string, { importe: number; periodoOrigen: string }>()
  for (const crudo of arr.data ?? []) {
    const f = FilaArrastre.safeParse(crudo)
    if (!f.success) continue
    const prev = arrastres.get(f.data.desde)
    arrastres.set(f.data.desde, prev
      ? { importe: r2(prev.importe + f.data.importe), periodoOrigen: `${prev.periodoOrigen}, ${f.data.periodo_origen}` }
      : { importe: r2(f.data.importe), periodoOrigen: f.data.periodo_origen })
  }
  const cuil = typeof per.data?.cuil === 'string' ? per.data.cuil : null
  if (arrastres.size === 0 || !cuil) return recibos
  const { data: netos, error } = await supabase.from('nomina_recibo_neto')
    .select('cuil, periodo, neto').in('cuil', [...new Set([cuil, cuilNormalizado(cuil) ?? cuil])])
  if (error) return recibos
  const filas = (netos ?? []).flatMap((x) => { const f = FilaNeto.safeParse(x); return f.success ? [f.data] : [] })
  return recibos.map((r) => {
    const neto = filas.find((f) => mismoCuil(f.cuil, cuil) && f.periodo === periodoDe(r.quincenaDesde))?.neto ?? null
    const medios = desglosarBancoSellado(r.renglones.medios, { netoDelEstudio: neto, arrastre: arrastres.get(r.quincenaDesde) ?? null })
    return medios === r.renglones.medios ? r : { ...r, renglones: { ...r.renglones, medios } }
  })
}
