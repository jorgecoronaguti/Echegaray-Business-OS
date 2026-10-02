// EL COSTO DE MANO DE OBRA DE LA SOLAPA NÓMINA — LA MISMA CUENTA QUE USA OBRAS, NO UNA PROPIA.
//
// Dueño, 02/10/2026: «eso no está leyendo bien los costos de MO de personal». La solapa medía lo PAGADO
// sin cargas (pedido del 22/09, `nominaPagada.ts`): ene–ago daba 156,7 M contra 226,9 M de costo de MO
// en Obras (−31 %), y septiembre salía con 9,45 M porque sólo contaba `pagado_*` de quincenas abiertas.
//
// ═══ POR QUÉ SE LLAMA A `costo_mo_quincena` Y NO SE RECALCULA ═══
//
// REALIDAD ÚNICA: el costo de MO se define una vez, en Postgres (`costo_mo_quincena`: la foto sellada si
// la quincena cerró, el cálculo en vivo si no). Liquidación, el CRM y el cuadro económico ya la leen. Acá
// sólo se SUMA POR MES lo que esa función devuelve, con el mismo parseo de filas (`filasDeCosto`). Se
// descartó recomputarlo en TypeScript con `neto × factor`: sería un cuarto número para «el costo de MO».
//
// ═══ «REAL» Y «ESTIMADO» NO SE MEZCLAN EN SILENCIO ═══
//
// Ene–jun el blanco es bruto del recibo × factor (los recibos no traen contribuciones): ESTIMACIÓN. Desde
// julio es el costo total del empleador del recibo: REAL. Cada fila de la función trae su `estado`; el mes
// publica la parte estimada y su etiqueta. Una fila `falta_dato` (persona sin tarifa) no suma ni como 0:
// se cuenta aparte, igual que en Obras.
//
// ═══ LO PAGADO NO SE QUITA (dueño, 22/09) ═══
//
// Viaja al lado, con su rótulo. La DIFERENCIA (cargas, FCL, ART) sólo se calcula en los meses cuyo pagado
// salió de la quincena cerrada: el pagado «por canal» de un mes abierto es lo registrado hasta hoy, y
// restarlo del costo mostraría como «cargas» plata que simplemente no se registró.
//
// Puro salvo `leerCostoNomina`. Se prueba en `costoNomina.test.ts` con fixture.

import type { SupabaseClient } from '@supabase/supabase-js'
import { filasDeCosto, type FilaDeCostoQuincena } from '../../administracion/services/costoObraQuincena.ts'
import type { MesPagado } from './nominaPagada.ts'

const r2 = (x: number): number => Math.round(x * 100) / 100

export type EtiquetaDeCosto = 'real' | 'estimado' | 'en parte estimado'

/** Las filas de UNA quincena, o `null` si la función no pudo leerse: ese mes no se publica a medias. */
export interface QuincenaDeCosto { desde: string; filas: FilaDeCostoQuincena[] | null }

export interface MesDeCosto {
  mes: string
  /** Σ de `costo_total` de las filas valorizadas. `null` = alguna quincena del mes no se pudo leer. */
  costo: number | null
  blanco: number
  negro: number
  /** La parte de `costo` que es estimada (ene–jun, o sin recibo del período todavía). */
  estimado: number
  etiqueta: EtiquetaDeCosto | null
  /** Personas sin tarifa: no suman al costo, no son «0». */
  sinDato: number
  /** Mes incompleto: el corriente, o con una sola de sus dos quincenas. */
  parcial: boolean
}

export interface LineaDeNomina {
  mes: string
  costo: MesDeCosto | null
  pagado: MesPagado | null
  /** Costo menos pagado (cargas, FCL, ART). `null` si alguno de los dos no es comparable. */
  diferencia: number | null
}

export interface NominaConCosto {
  lineas: LineaDeNomina[]
  /** Costo de los meses completos con costo leído. */
  costoAnio: { total: number; estimado: number; meses: number } | null
  /** Costo − pagado, sumado en los meses donde los dos son comparables. */
  diferenciaAnio: { total: number; meses: number } | null
}

/** Suma por mes lo que devolvió `costo_mo_quincena`. Pura. */
export function costoPorMes(quincenas: readonly QuincenaDeCosto[], hoy: string): MesDeCosto[] {
  const porMes = new Map<string, QuincenaDeCosto[]>()
  for (const q of quincenas) porMes.set(q.desde.slice(0, 7), [...(porMes.get(q.desde.slice(0, 7)) ?? []), q])
  return [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, qs]) => {
    const parcial = mes >= hoy.slice(0, 7) || new Set(qs.map((q) => q.desde)).size < 2
    if (qs.some((q) => q.filas == null)) {
      return { mes, costo: null, blanco: 0, negro: 0, estimado: 0, etiqueta: null, sinDato: 0, parcial }
    }
    let costo = 0, blanco = 0, negro = 0, estimado = 0, sinDato = 0
    for (const f of qs.flatMap((q) => q.filas ?? [])) {
      if (f.estado === 'falta_dato') { sinDato++; continue }
      costo += f.total ?? 0
      blanco += f.blanco ?? 0
      negro += f.negro ?? 0
      if (f.estado === 'estimado') estimado += f.total ?? 0
    }
    const etiqueta: EtiquetaDeCosto = estimado === 0 ? 'real' : r2(estimado) >= r2(costo) ? 'estimado' : 'en parte estimado'
    return { mes, costo: r2(costo), blanco: r2(blanco), negro: r2(negro), estimado: r2(estimado), etiqueta, sinDato, parcial }
  })
}

/** Junta costo y pagado por mes. Un mes con una sola de las dos lecturas sigue estando, con la otra en `null`. */
export function nominaConCosto(costos: readonly MesDeCosto[], pagados: readonly MesPagado[]): NominaConCosto {
  const meses = [...new Set([...costos.map((c) => c.mes), ...pagados.map((p) => p.mes)])].sort()
  const lineas = meses.map((mes): LineaDeNomina => {
    const costo = costos.find((c) => c.mes === mes) ?? null
    const pagado = pagados.find((p) => p.mes === mes) ?? null
    const comparable = costo?.costo != null && !costo.parcial && pagado?.medida === 'quincena_cerrada' && pagado.total != null
    return { mes, costo, pagado, diferencia: comparable ? r2(costo!.costo! - pagado!.total!) : null }
  })
  const completos = lineas.filter((l) => l.costo?.costo != null && !l.costo.parcial)
  const comparables = lineas.filter((l) => l.diferencia != null)
  return {
    lineas,
    costoAnio: completos.length ? {
      total: r2(completos.reduce((s, l) => s + l.costo!.costo!, 0)),
      estimado: r2(completos.reduce((s, l) => s + l.costo!.estimado, 0)),
      meses: completos.length,
    } : null,
    diferenciaAnio: comparables.length
      ? { total: r2(comparables.reduce((s, l) => s + l.diferencia!, 0)), meses: comparables.length }
      : null,
  }
}

const DE_A = 4

/**
 * Llama a `costo_mo_quincena` —la de Obras— una vez por quincena. De a pocas por vez: cada llamada
 * recorre liquidación y recibos y la base está justa (una ráfaga de 19 ya tumbó Postgres antes).
 */
export async function leerCostoNomina(supabase: SupabaseClient, desdes: readonly string[]): Promise<QuincenaDeCosto[]> {
  const unicas = [...new Set(desdes)].sort()
  const salida: QuincenaDeCosto[] = []
  for (let i = 0; i < unicas.length; i += DE_A) {
    salida.push(...await Promise.all(unicas.slice(i, i + DE_A).map(async (desde): Promise<QuincenaDeCosto> => {
      const r = await supabase.rpc('costo_mo_quincena', { p_desde: desde })
      return { desde, filas: r.error ? null : filasDeCosto(r.data) }
    })))
  }
  return salida
}
