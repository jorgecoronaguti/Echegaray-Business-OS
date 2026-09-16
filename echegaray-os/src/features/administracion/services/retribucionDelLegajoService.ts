// LAS LECTURAS DE LA SECCIÓN «RETRIBUCIÓN» DEL LEGAJO. La regla está en `retribucionDelLegajo.ts`.
//
// ═══ SE LE PREGUNTA A LA LIQUIDACIÓN, QUINCENA POR QUINCENA ═══
//
// Cada quincena del año se lee con `getLiquidacionDeLaQuincena` —la MISMA función que arma las siete
// solapas del módulo— y de su resultado se toma la línea de esta persona. No hay una lectura «por
// persona» aparte porque no existe una cadena de pago por persona: los overrides, el espejo de
// JORNALES, el blanco estimado y el presentismo se resuelven sobre el plantel entero, y una versión
// recortada acá sería una segunda respuesta a «cuánto cobra». Es la lectura más cara del legajo y por
// eso corre SÓLO en su solapa, nunca en el resumen.
//
// DE A SEIS: dieciocho quincenas en paralelo son más de doscientas consultas de golpe sobre una base
// que ya se cayó tres veces por carga (13/09/2026); en serie serían dieciocho viajes de un segundo.
// Medido el 16/09/2026 en `next dev` contra la base real: de a tres, 4,8–11 s de código de aplicación;
// de a seis, la mitad. Sigue siendo la pantalla más lenta del legajo — el día que pese, el camino es una
// lectura por persona DENTRO de `liquidacionQuincenaService`, no una copia recortada acá.
//
// ═══ SIN PERMISO NO SE VIAJA ═══
//
// Las tablas tienen RLS por `liquida_sueldos()` y el jefe de obra abre este legajo: para él la
// respuesta sería un 200 con cero filas. Se corta ANTES de la primera consulta —el mismo criterio que
// el rótulo de $/h— y la sección lo dice con todas las letras.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getLiquidacionDeLaQuincena } from './liquidacionQuincenaService.ts'
import { estadoDelCuadro } from './estadoDelCuadro.ts'
import { cuilNormalizado } from './cuil.ts'
import { rotuloQuincena, type Quincena } from './quincena.ts'
import {
  armarRetribucion, quincenasDelAnio, type QuincenaRetribuida, type ReciboDelBlanco, type RetribucionDelLegajo,
} from './retribucionDelLegajo.ts'

const EN_PARALELO = 6

const numero = (v: unknown): number | null =>
  v == null || !Number.isFinite(Number(v)) ? null : Number(v)

const sinTabla = (e: { code?: string; message: string }): boolean =>
  e.code === '42P01' || /does not exist/i.test(e.message)

export interface PersonaDeRetribucion {
  personaId: string
  cuil: string | null
  /** `liquidaSueldos(rol)` del que mira. */
  puedeVer: boolean
  anio: number
  /** El día se fija en el servidor: decide hasta qué quincena se lee. */
  hoy: string
}

/** La quincena de UNA persona, tomada del cuadro de la Liquidación en el que cayó. */
async function leerQuincena(
  supabase: SupabaseClient, q: Quincena, personaId: string,
): Promise<{ fila: QuincenaRetribuida; errores: string[] }> {
  const liq = await getLiquidacionDeLaQuincena(supabase, q)
  const errores = liq.errores.map((e) => `${e.que}: ${e.error}`)
  for (const c of liq.cuadros) {
    const linea = c.lineas.find((l) => l.personaId === personaId)
    if (!linea) continue
    return { fila: { quincena: q, estado: estadoDelCuadro(liq.estados, c.grupo).estado, linea }, errores }
  }
  return { fila: { quincena: q, estado: null, linea: null }, errores }
}

/** Todas las quincenas, de a `EN_PARALELO`. Una que falla entera se dice como error y queda fuera del plantel. */
async function leerQuincenas(
  supabase: SupabaseClient, quincenas: readonly Quincena[], personaId: string,
): Promise<{ filas: QuincenaRetribuida[]; errores: string[] }> {
  const filas: QuincenaRetribuida[] = []
  const errores: string[] = []
  for (let i = 0; i < quincenas.length; i += EN_PARALELO) {
    const tanda = await Promise.all(quincenas.slice(i, i + EN_PARALELO).map(async (q) => {
      try {
        return await leerQuincena(supabase, q, personaId)
      } catch (e) {
        const mensaje = e instanceof Error ? e.message : String(e)
        return { fila: { quincena: q, estado: null, linea: null }, errores: [`${rotuloQuincena(q)}: ${mensaje}`] }
      }
    }))
    for (const t of tanda) {
      filas.push(t.fila)
      errores.push(...t.errores)
    }
  }
  return { filas, errores }
}

/** Las líneas de recibo REAL de la persona, por id o por CUIL (la llave con la que carga el estudio). */
async function leerRecibos(
  supabase: SupabaseClient, p: PersonaDeRetribucion,
): Promise<{ recibos: ReciboDelBlanco[]; error: string | null }> {
  const cuil = cuilNormalizado(p.cuil)
  const r = await supabase.from('recibo_sueldo_linea')
    .select('periodo, categoria, valor_hora, neto')
    .or(cuil ? `persona_id.eq.${p.personaId},cuil.eq.${cuil}` : `persona_id.eq.${p.personaId}`)
  if (r.error && !sinTabla(r.error)) return { recibos: [], error: `los recibos de sueldo: ${r.error.message}` }
  return {
    recibos: ((r.data ?? []) as Record<string, unknown>[]).map((f) => ({
      periodo: String(f.periodo ?? ''),
      categoria: typeof f.categoria === 'string' && f.categoria.trim() !== '' ? f.categoria : null,
      valorHora: numero(f.valor_hora),
      neto: numero(f.neto),
    })),
    error: null,
  }
}

/** LA SECCIÓN «RETRIBUCIÓN» DE UNA PERSONA, con lo que la Liquidación calcula para cada quincena del año. */
export async function getRetribucionDelLegajo(
  supabase: SupabaseClient, p: PersonaDeRetribucion,
): Promise<RetribucionDelLegajo> {
  if (!p.puedeVer) {
    return armarRetribucion({ puedeVer: false, anio: p.anio, quincenas: [], recibos: [], errores: [] })
  }
  const [{ filas, errores }, recibos] = await Promise.all([
    leerQuincenas(supabase, quincenasDelAnio(p.anio, p.hoy), p.personaId),
    leerRecibos(supabase, p),
  ])
  return armarRetribucion({
    puedeVer: true, anio: p.anio, quincenas: filas, recibos: recibos.recibos,
    errores: recibos.error ? [...errores, recibos.error] : errores,
  })
}
