// LA REIMPRESIÓN DE UN RECIBO YA EMITIDO, CON EL BANCO ABIERTO (dueño, 02/10/2026).
//
// Los RP de la Q2-09 se sellaron con «Depósito en banco» = neto del estudio + saldo del recibo de la Q1, en un solo
// renglón: no coincidía con el recibo del estudio. Lo sellado NO se toca (ni su número ni sus importes): se desglosa
// AL MOSTRAR, con el neto del estudio (`nomina_recibo_neto`) y el arrastre (`liquidacion_arrastre`) leídos de la base.
// Si alguna de las dos lecturas falla o las cuentas no cierran al centavo, el papel sale tal como se selló: sin
// migración y sin UPDATE, y sin inventar un desglose sobre un papel que la persona ya firmó.

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { arrastreYaIncluido, recibosDelEstudio } from './recibosDelEstudio.ts'
import { leerModalidadDeCobro } from './recibosDelEstudioService.ts'
import { cuilNormalizado } from './cuil.ts'
import { ROTULO, desglosarBancoSellado, limpiarMediosSellados } from './reciboDeLaQuincena.ts'
import type { ReciboEnElLegajo } from './reciboEmitido.ts'

const FilaNeto = z.object({ cuil: z.string().nullable(), periodo: z.string(), neto: z.coerce.number().finite() })
const FilaArrastre = z.object({ desde: z.string(), importe: z.coerce.number().finite().positive(), periodo_origen: z.string() })

const r2 = (n: number) => Math.round(n * 100) / 100

/** Devuelve los mismos recibos con el banco desglosado donde las cuentas cierran. Ante un error de lectura, los deja como están. */
export async function conBancoDesglosado(supabase: SupabaseClient, personaId: string, crudos: ReciboEnElLegajo[]): Promise<ReciboEnElLegajo[]> {
  // PRIMERO LA LIMPIEZA, y siempre: los rótulos largos y las cuentas escritas junto a un importe no se reimprimen.
  const recibos = crudos.map((r) => {
    const medios = limpiarMediosSellados(r.renglones.medios)
    return medios.every((m, i) => m === r.renglones.medios[i]) ? r : { ...r, renglones: { ...r.renglones, medios } }
  })
  if (recibos.length === 0) return recibos
  const ultimoHasta = recibos.reduce((m, r) => (r.quincenaHasta > m ? r.quincenaHasta : m), '')
  const [arr, per, modalidad] = await Promise.all([
    supabase.from('liquidacion_arrastre').select('desde, importe, periodo_origen').eq('persona_id', personaId),
    supabase.from('persona_legajo').select('cuil').eq('id', personaId).maybeSingle(),
    leerModalidadDeCobro(supabase, personaId, ultimoHasta),
  ])
  if (arr.error || per.error || modalidad == null) return recibos
  const mensual = modalidad === 'mensual'
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
  // El mensual se desglosa aunque no tenga arrastre: su banco son dos recibos.
  if ((arrastres.size === 0 && !mensual) || !cuil) return recibos
  const { data: netos, error } = await supabase.from('nomina_recibo_neto')
    .select('cuil, periodo, neto').in('cuil', [...new Set([cuil, cuilNormalizado(cuil) ?? cuil])])
  if (error) return recibos
  const filas = (netos ?? []).flatMap((x) => { const f = FilaNeto.safeParse(x); return f.success ? [f.data] : [] })
  return recibos.map((r) => {
    const estudio = recibosDelEstudio({ cuil, modalidad, desde: r.quincenaDesde, filas })
    const crudaResta = arrastres.get(r.quincenaDesde) ?? null
    // El recibo de la 1ª quincena de un mensual ya está dentro de su banco: no es «saldo» (`arrastreYaIncluido`).
    const resta = mensual && crudaResta && arrastreYaIncluido(crudaResta.periodoOrigen, estudio.periodos) ? null : crudaResta
    if (mensual) {
      // LO SELLADO NO SE TOCA: un papel de mensual que se firmó con otro banco (sólo la 2ª quincena) sale como se selló.
      const banco = r.renglones.medios.find((m) => !m.sub && m.rotulo === ROTULO.banco)?.importe ?? null
      if (estudio.total == null || banco == null || r2(banco - (resta?.importe ?? 0) - estudio.total) !== 0) return r
    }
    const medios = desglosarBancoSellado(r.renglones.medios, {
      netoDelEstudio: estudio.total, arrastre: resta, ...(mensual ? { recibos: estudio.recibos } : {}),
    })
    return medios === r.renglones.medios ? r : { ...r, renglones: { ...r.renglones, medios } }
  })
}
