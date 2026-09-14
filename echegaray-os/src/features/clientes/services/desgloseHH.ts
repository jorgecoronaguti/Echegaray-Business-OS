// EL DESGLOSE DE HORAS DE UNA OBRA: QUIÉN, QUÉ DÍA, CUÁNTAS.
//
// «Que de ahí me lleve a un desglose de la obra entera con las personas por día que participaron de
// las HH» (dueño, 11/09/2026 18:38). Lo trae `public.hh_de_obra(obra, desde)` en UN viaje; acá se
// convierte y se arma la grilla. Ninguna regla de negocio nueva: la definición de HH real es la de
// `obra_plan_vs_real` y el acumulado de la obra LO PASA LA PANTALLA, no se vuelve a sumar.
//
// ═══ ABRE EN LA OBRA ENTERA, Y LOS CORTES SON LOS BLOQUES DE JORNALES ═══
//
// Hasta el 13/09/2026 abría en la ÚLTIMA quincena calendario: en Quattropani la grilla mostraba
// 01/09–10/09 y el bloque 17/08–31/08 —el inicio real de la obra y 226 de sus 378 h— quedaba en un
// link. El dueño lo leyó como que no se había traído la quincena anterior («está mal lo de
// Quattropani»). Ahora `ventana` null = la obra entera, que es lo que pidió el 11/09.
//
// Los períodos son los BLOQUES de la planilla (03/08–15/08, 17/08–31/08…), no la quincena calendario:
// JORNALES no liquida del 16 al fin de mes, y un corte que no coincide con ningún bloque produce
// totales que no aparecen en la planilla. El `hasta` lo manda SQL; `finDeQuincena` sólo cubre una
// respuesta vieja de la caché que todavía no lo traiga.
//
// ═══ CERO HORAS Y UNA AUSENCIA NO SON LO MISMO QUE UNA CELDA VACÍA ═══
//
//   · sin fila          la persona no tuvo nada ese día      celda vacía
//   · ausencia/licencia estuvo declarada ausente             «A» / «L», y NO suma
//   · horas             trabajó                              el número
//
// Una ausencia dibujada como «0» haría que una quincena con cuatro ausencias se leyera como cuatro
// días de trabajo sin rendimiento, que es la conclusión opuesta.

import { diaMesAnioCompletoISO } from '../../../shared/utils/fecha.ts'
import { armarSinRespaldo, type SinRespaldo } from './hhDePlanilla.ts'

export interface CeldaDia {
  personaId: string | null
  fecha: string
  /** Horas TRABAJADAS del día (normal + extras). `null` = ese día no trabajó. */
  horas: number | null
  ausencia: boolean
  licencia: boolean
}

export interface PersonaHH {
  personaId: string | null
  /** `null` = la fila de horas no tiene persona (las filas legacy de JORNALES). Se dice, no se borra. */
  nombre: string | null
  hh: number | null
  dias: number
  primera: string | null
  ultima: string | null
}

export interface PeriodoHH {
  desde: string
  hasta: string
  /** `null` = la quincena tiene filas pero ninguna de trabajo (sólo ausencias). */
  hh: number | null
  dias: number
  registros: number
  etiqueta: string
}

export interface DesgloseDeHoras {
  obra: { obraId: string; nombre: string; clienteSlug: string | null; estado: string | null }
  registros: number
  personas: number
  /** Primera y última fecha con horas de TODA la obra. */
  desde: string | null
  hasta: string | null
  /** El bloque que se está dibujando (su `desde`). `null` = la OBRA ENTERA, que es con lo que abre. */
  ventana: string | null
  periodos: PeriodoHH[]
  porPersona: PersonaHH[]
  celdas: CeldaDia[]
  /** Lo cargado en la app sin respaldo en JORNALES (dueño, 13/09/2026). No está en nada de arriba. */
  sinRespaldo: SinRespaldo[]
  /**
   * CUÁNDO SE CALCULÓ (`cache_calculado_en`, desde 20260913T1500). `null` = en vivo para este pedido;
   * con valor salió de `ficha_cliente_cache` y la pantalla dice de cuándo es.
   */
  calculadoEn: string | null
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v.slice(0, 120) : null
}

function dia(v: unknown): string | null {
  const t = texto(v)
  return t ? t.slice(0, 10) : null
}

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/**
 * EL ÚLTIMO DÍA DE LA QUINCENA QUE EMPIEZA EN `desde`.
 *
 * Se calcula con `Date.UTC` y se escribe cortando el ISO: `new Date('2026-02-01')` es medianoche UTC
 * y en Buenos Aires (−3) se lee 31/01, que pondría la quincena en el mes anterior.
 */
export function finDeQuincena(desde: string): string {
  const [a, m, d] = desde.slice(0, 10).split('-').map(Number)
  if (d <= 15) return `${desde.slice(0, 8)}15`
  // Día 0 del mes siguiente = último día de éste.
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return `${desde.slice(0, 8)}${String(ultimo).padStart(2, '0')}`
}

/** «1ª quincena sep/26». Ya no rotula los períodos (son bloques de JORNALES): queda para quien lo use. */
export function etiquetaDeQuincena(desde: string): string {
  const [a, m, d] = desde.slice(0, 10).split('-').map(Number)
  return `${d <= 15 ? '1ª' : '2ª'} quincena ${MES[m - 1]}/${String(a).slice(2)}`
}

/** «17/08–31/08»: el bloque como está escrito en la planilla, sin inventarle un nombre. */
export function etiquetaDeBloque(desde: string, hasta: string): string {
  const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  return `${dm(desde)}–${dm(hasta)}`
}

/** Lo que devuelve `hh_de_obra`. `null` = no puedo leerlo (rol sin permiso u obra inexistente). */
export function armarDesgloseHH(j: unknown): DesgloseDeHoras | null {
  if (j == null || typeof j !== 'object') return null
  const r = j as Record<string, unknown>
  const o = (r.obra ?? null) as Record<string, unknown> | null
  const obraId = texto(o?.obra_id)
  if (!obraId) return null
  return {
    obra: {
      obraId,
      nombre: texto(o?.nombre) ?? obraId,
      clienteSlug: texto(o?.cliente_slug),
      estado: texto(o?.estado),
    },
    registros: num(r.registros) ?? 0,
    personas: num(r.personas) ?? 0,
    desde: dia(r.desde),
    hasta: dia(r.hasta),
    ventana: dia(r.ventana),
    periodos: ((r.periodos ?? []) as Record<string, unknown>[]).flatMap((p) => {
      const desde = dia(p.desde)
      if (!desde) return []
      const hasta = dia(p.hasta) ?? finDeQuincena(desde)
      return [{
        desde,
        hasta,
        hh: num(p.hh),
        dias: num(p.dias) ?? 0,
        registros: num(p.registros) ?? 0,
        etiqueta: etiquetaDeBloque(desde, hasta),
      }]
    }),
    porPersona: ((r.por_persona ?? []) as Record<string, unknown>[]).map((p) => ({
      personaId: texto(p.persona_id),
      nombre: texto(p.nombre),
      hh: num(p.hh),
      dias: num(p.dias) ?? 0,
      primera: dia(p.primera),
      ultima: dia(p.ultima),
    })),
    celdas: ((r.celdas ?? []) as Record<string, unknown>[]).flatMap((c) => {
      const fecha = dia(c.fecha)
      if (!fecha) return []
      return [{
        personaId: texto(c.persona_id),
        fecha,
        horas: num(c.horas),
        ausencia: c.ausencia === true,
        licencia: c.licencia === true,
      }]
    }),
    sinRespaldo: armarSinRespaldo(r.sin_respaldo),
    calculadoEn: texto(r.cache_calculado_en),
  }
}

/**
 * EL ÍNDICE DE CADA DÍA DE LA GRILLA DONDE EMPIEZA UN BLOQUE, con su rango. Con la obra entera la
 * grilla cruza varios bloques y sin esta marca 31/08 y 01/09 se leen como días seguidos del mismo
 * corte. Un día que no cae en ningún período no abre bloque.
 */
export function iniciosDeBloque(dias: readonly string[], periodos: readonly PeriodoHH[]): Map<number, PeriodoHH> {
  const inicios = new Map<number, PeriodoHH>()
  let anterior: PeriodoHH | null = null
  dias.forEach((f, i) => {
    const p = periodos.find((x) => f >= x.desde && f <= x.hasta) ?? null
    if (p && p !== anterior) inicios.set(i, p)
    anterior = p
  })
  return inicios
}

export interface FilaDeGrilla {
  persona: PersonaHH
  /** Una por día de la ventana, en el mismo orden que `dias`. `null` = ese día no tuvo fila. */
  celdas: (CeldaDia | null)[]
  /** Lo trabajado por esta persona EN LO QUE SE DIBUJA —un bloque o la obra entera—; `persona.hh`
   *  es siempre el acumulado de la obra. */
  total: number | null
}

export interface GrillaDeHoras {
  /** Los días con algo cargado en lo que se dibuja, ordenados. Un domingo sin horas no es una
   *  columna: es ruido que corre el ancho de las que sí tienen algo. */
  dias: string[]
  filas: FilaDeGrilla[]
  /** Σ de cada día. */
  porDia: (number | null)[]
  /** Σ de la ventana. */
  total: number | null
}

function suma(xs: (number | null)[]): number | null {
  const ns = xs.filter((x): x is number => x != null)
  return ns.length ? ns.reduce((a, b) => a + b, 0) : null
}

/**
 * LA GRILLA PERSONA × DÍA DE LA VENTANA.
 *
 * Las FILAS salen de `porPersona` —que está ordenado por acumulado de la obra— y se quedan sólo las
 * que tienen algo en la ventana: una persona que trabajó en enero no agrega una fila vacía en
 * septiembre. Las COLUMNAS son los días con algo cargado, que es lo que mantiene la tabla leíble.
 */
export function grillaDeHoras(d: DesgloseDeHoras): GrillaDeHoras {
  const dias = [...new Set(d.celdas.map((c) => c.fecha))].sort()
  const porPersona = new Map<string, CeldaDia[]>()
  for (const c of d.celdas) {
    const k = c.personaId ?? ''
    porPersona.set(k, [...(porPersona.get(k) ?? []), c])
  }
  const filas: FilaDeGrilla[] = d.porPersona
    .filter((p) => porPersona.has(p.personaId ?? ''))
    .map((p) => {
      const suyas = porPersona.get(p.personaId ?? '') ?? []
      const celdas = dias.map((f) => suyas.find((c) => c.fecha === f) ?? null)
      return { persona: p, celdas, total: suma(celdas.map((c) => c?.horas ?? null)) }
    })
  return {
    dias,
    filas,
    porDia: dias.map((_, i) => suma(filas.map((fi) => fi.celdas[i]?.horas ?? null))),
    total: suma(filas.map((f) => f.total)),
  }
}

/** El período de la obra en palabras: «05/01/2026 → 15/08/2026». Sin fechas, lo dice. */
export function periodoDeLaObra(d: DesgloseDeHoras): string {
  if (!d.desde || !d.hasta) return 'sin horas cargadas'
  return `${diaMesAnioCompletoISO(d.desde)} → ${diaMesAnioCompletoISO(d.hasta)}`
}

/** Lo que dibuja una celda de la grilla. Una ausencia NUNCA es un cero. */
export function textoDeCelda(c: CeldaDia | null): { texto: string; marca: boolean } {
  if (!c) return { texto: '', marca: false }
  if (c.horas != null) return { texto: `${Number(c.horas).toLocaleString('es-AR', { maximumFractionDigits: 1 })}`, marca: false }
  if (c.licencia) return { texto: 'L', marca: true }
  if (c.ausencia) return { texto: 'A', marca: true }
  return { texto: '', marca: false }
}

// ═══ LA LECTURA: UN VIAJE, Y SÓLO CUANDO EL DESGLOSE ESTÁ ABIERTO ═══
//
// No entra en `pantalla_cliente`: el desglose es de UNA obra y se pide con un clic. Meterlo en la
// RPC de la ficha lo haría viajar en las nueve caras para nada (y la RPC de la ficha ya es el viaje
// más caro del módulo). `null` con `error` en `null` = no puedo verlo: lo dice la pantalla.
import type { SupabaseClient } from '@supabase/supabase-js'

export async function leerDesgloseHH(
  supabase: SupabaseClient, obraId: string, desde: string | null,
): Promise<{ desglose: DesgloseDeHoras | null; error: string | null }> {
  const { data, error } = await supabase.rpc('hh_de_obra', {
    p_obra: obraId,
    // `null` explícito y no ausente: el default de la función es el mismo, pero una clave faltante
    // en el cuerpo de PostgREST hace que la sobrecarga se resuelva por otra firma.
    p_desde: desde,
  })
  if (error) return { desglose: null, error: error.message }
  return { desglose: armarDesgloseHH(data), error: null }
}
