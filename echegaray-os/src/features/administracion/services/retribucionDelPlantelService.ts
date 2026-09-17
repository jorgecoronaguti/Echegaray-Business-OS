// LAS LECTURAS DE LA SOLAPA «RETRIBUCIÓN» DEL PLANTEL. La regla está en `retribucionDelPlantel.ts`.
//
// ═══ UNA LECTURA POR QUINCENA, NO UNA POR PERSONA ═══
//
// El legajo le pregunta a la Liquidación quincena por quincena y se queda con UNA línea. Acá se le hace la
// misma pregunta la misma cantidad de veces y se reparten TODAS las líneas: dieciocho quincenas, no
// dieciocho por treinta personas. Lo demás —legajos, tarifas, recibos, escalas— son cinco consultas del
// plantel entero, filtradas por los ids que la Liquidación dio por activos.
//
// De a seis, con el mismo motivo que `retribucionDelLegajoService.ts`: la base se cayó por carga el 13/09.
//
// ═══ EL TOPE DE FILAS SE DICE ═══
//
// PostgREST corta en 1.000 filas y contesta 200 sin error. Una tabla que llega justo al tope no se puede
// afirmar completa: se avisa, en vez de mostrar un año con quincenas que parecen impagas.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getLiquidacionDeLaQuincena } from './liquidacionQuincenaService.ts'
import { cuilNormalizado } from './cuil.ts'
import { rotuloQuincena, type Quincena } from './quincena.ts'
import { quincenasDelAnio, type ReciboDelBlanco } from './retribucionDelLegajo.ts'
import {
  armarRetribucionDelPlantel, plantelActivo, type Medida, type PersonaDelPlantelRetribuido,
  type QuincenaLeida, type RetribucionDelPlantel,
} from './retribucionDelPlantel.ts'
import { filasDeTarifa, leerEscalasDelPiso, pisoDe, ultimoReciboDe } from './valorHoraDelLegajoService.ts'
import { rotuloDeValorHora } from './valorHoraDelLegajo.ts'

const EN_PARALELO = 6
const TOPE_POSTGREST = 1000

type Fila = Record<string, unknown>

const numero = (v: unknown): number | null =>
  v == null || !Number.isFinite(Number(v)) ? null : Number(v)

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

const sinTabla = (e: { code?: string; message: string }): boolean =>
  e.code === '42P01' || /does not exist/i.test(e.message)

async function leerLiquidaciones(
  supabase: SupabaseClient, quincenas: readonly Quincena[],
): Promise<{ lecturas: QuincenaLeida[]; errores: string[] }> {
  const lecturas: QuincenaLeida[] = []
  const errores: string[] = []
  for (let i = 0; i < quincenas.length; i += EN_PARALELO) {
    const tanda = await Promise.all(quincenas.slice(i, i + EN_PARALELO).map(async (q) => {
      try {
        const liq = await getLiquidacionDeLaQuincena(supabase, q)
        return {
          lectura: { quincena: q, cuadros: liq.cuadros, estados: liq.estados },
          errores: liq.errores.map((e) => `${e.que}: ${e.error}`),
        }
      } catch (e) {
        const mensaje = e instanceof Error ? e.message : String(e)
        return { lectura: { quincena: q, cuadros: [], estados: {} }, errores: [`${rotuloQuincena(q)}: ${mensaje}`] }
      }
    }))
    for (const t of tanda) {
      lecturas.push(t.lectura)
      errores.push(...t.errores)
    }
  }
  return { lecturas, errores }
}

interface Legajo { id: string; cuil: string | null; categoria: string | null; convenio: string | null }

/** Legajos, tarifas y recibos del plantel activo, en una tanda. */
async function leerDelPlantel(supabase: SupabaseClient, ids: readonly string[], hoy: string) {
  const [legajos, escala, cct] = await Promise.all([
    supabase.from('persona_legajo').select('id, cuil, categoria, convenio_colectivo').in('id', ids),
    ...leerEscalasDelPiso(supabase, hoy),
  ])
  const porId = new Map<string, Legajo>(((legajos.data ?? []) as Fila[]).map((f) => [String(f.id), {
    id: String(f.id), cuil: texto(f.cuil), categoria: texto(f.categoria), convenio: texto(f.convenio_colectivo),
  }]))
  const cuiles = [...porId.values()].map((l) => cuilNormalizado(l.cuil)).filter((c): c is string => c != null)
  // EL RECIBO SE ENGANCHA POR PERSONA O POR CUIL, como en el legajo: la línea del estudio no siempre trae id.
  const filtro = cuiles.length > 0
    ? `persona_id.in.(${ids.join(',')}),cuil.in.(${cuiles.join(',')})`
    : `persona_id.in.(${ids.join(',')})`
  const [tarifas, recibos] = await Promise.all([
    supabase.from('persona_tarifa').select('persona_id, desde, valor_hora, neto_mensual, origen').in('persona_id', ids),
    supabase.from('recibo_sueldo_linea').select('persona_id, cuil, periodo, categoria, valor_hora, neto').or(filtro),
  ])
  const errores: string[] = []
  const anotar = (que: string, r: { data: unknown; error: { code?: string; message: string } | null }) => {
    if (r.error && !sinTabla(r.error)) errores.push(`${que}: ${r.error.message?.trim() || 'la base rechazó la consulta'}`)
    if (Array.isArray(r.data) && r.data.length >= TOPE_POSTGREST) errores.push(`${que}: llegó al tope de ${TOPE_POSTGREST} filas`)
  }
  anotar('los legajos', legajos)
  anotar('el $/h pactado', tarifas)
  anotar('los recibos de sueldo', recibos)
  anotar('la escala del convenio', escala)
  anotar('la escala del CCT', cct)
  return {
    porId, errores, escala: escala.data, cct: cct.data,
    tarifas: (tarifas.data ?? []) as Fila[], recibos: (recibos.data ?? []) as Fila[],
  }
}

export interface PedidoDelPlantel {
  /** `liquidaSueldos(rol)` del que mira. Sin permiso no se viaja. */
  puedeVer: boolean
  anio: number
  hoy: string
  medida: Medida
}

/** LA SOLAPA «RETRIBUCIÓN» DEL PLANTEL. */
export async function getRetribucionDelPlantel(
  supabase: SupabaseClient, p: PedidoDelPlantel,
): Promise<RetribucionDelPlantel> {
  const vacia = { puedeVer: p.puedeVer, anio: p.anio, medida: p.medida, personas: [], errores: [],
    recibosDe: () => [],
    rotuloDe: () => rotuloDeValorHora({ puedeVer: false, tarifas: [], recibo: null, piso: null, categoria: null, hoy: p.hoy }) }
  if (!p.puedeVer) return armarRetribucionDelPlantel({ ...vacia, lecturas: [] })

  const { lecturas, errores } = await leerLiquidaciones(supabase, quincenasDelAnio(p.anio, p.hoy))
  // EL PLANTEL ES EL DE HOY aunque se mire otro año: un año pasado se lee con la gente que sigue.
  const activo = plantelActivo(p.anio === Number(p.hoy.slice(0, 4))
    ? lecturas
    : (await leerLiquidaciones(supabase, quincenasDelAnio(Number(p.hoy.slice(0, 4)), p.hoy).slice(-1))).lecturas)
  if (activo.length === 0) return armarRetribucionDelPlantel({ ...vacia, lecturas, errores })

  const d = await leerDelPlantel(supabase, activo.map((a) => a.personaId), p.hoy)
  const personas: PersonaDelPlantelRetribuido[] = activo.map((a) => ({ ...a, cuil: d.porId.get(a.personaId)?.cuil ?? null }))
  const recibosCrudosDe = (x: PersonaDelPlantelRetribuido): Fila[] => {
    const cuil = cuilNormalizado(x.cuil)
    return d.recibos.filter((r) => r.persona_id === x.personaId || (cuil != null && r.cuil === cuil))
  }
  return armarRetribucionDelPlantel({
    puedeVer: true, anio: p.anio, medida: p.medida, lecturas, personas,
    errores: [...errores, ...d.errores],
    recibosDe: (x): ReciboDelBlanco[] => recibosCrudosDe(x).map((f) => ({
      periodo: String(f.periodo ?? ''),
      categoria: texto(f.categoria),
      valorHora: numero(f.valor_hora),
      neto: numero(f.neto),
    })),
    rotuloDe: (x) => {
      const legajo = d.porId.get(x.personaId)
      const persona = {
        personaId: x.personaId, cuil: x.cuil, categoria: legajo?.categoria ?? null,
        convenio: legajo?.convenio ?? null, puedeVer: true, hoy: p.hoy,
      }
      return rotuloDeValorHora({
        puedeVer: true, categoria: persona.categoria, hoy: p.hoy,
        tarifas: filasDeTarifa(d.tarifas.filter((t) => t.persona_id === x.personaId)),
        recibo: ultimoReciboDe(recibosCrudosDe(x)),
        piso: pisoDe(d.escala, d.cct, persona),
      })
    },
  })
}
