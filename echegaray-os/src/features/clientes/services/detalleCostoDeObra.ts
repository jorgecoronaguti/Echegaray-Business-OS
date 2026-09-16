// LO QUE COMPONE UNA CELDA DE COSTO DEL CRM: comprobante por comprobante, persona por quincena, persona.
//
// «A la derecha, cada vez que haga click en Materiales, HH, Mano de obra o Subcontratos, que me salga
// en ese menú discriminado lo que está considerando» (dueño, 15/09/2026). Lo trae
// `public.detalle_costo_de_obra(obra, rubro)` —o `detalle_costo_sin_obra(cliente, rubro)` para la fila
// «Gastos del cliente sin obra asignada»— en UN viaje y con el MISMO cálculo que la celda: la RPC de
// detalle y la de la celda leen las mismas filas (`costo_de_obra_filas`, `costo_mo_de_obras`,
// `hh_de_obra`), así que el total del panel cierra al centavo o hay un defecto, y `cierraConLaCelda`
// lo dice en la pantalla en vez de esconderlo.
//
// ═══ NINGUNA REGLA DE NEGOCIO ACÁ ═══
//
// Qué comprobante entra, qué parte está por vencer, cómo se valoriza una quincena: todo lo decide
// Postgres (20260915T2320). Este archivo valida la entrada de la URL, convierte y da forma.

// LAS RUTAS VAN RELATIVAS Y CON EXTENSIÓN: el alias `@/` lo resuelve el bundler, no `node --test`.
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ROTULO_MANO_OBRA, ROTULO_MATERIALES, ROTULO_SUBCONTRATOS, type CostoDeObra, type GastoSinObra } from './costosDeObra.ts'
import type { HorasDeObra } from './horasDeObra.ts'
import { frescuraDeLaFicha } from './frescuraFicha.ts'
import { hh as fmtHH, plata } from '../../../shared/utils/format.ts'

/** El parámetro `rubro` de la URL. Entrada de usuario: se valida, y lo que no valida no abre nada. */
export const RUBROS = ['materiales', 'subcontratos', 'mo', 'hh'] as const
export type Rubro = (typeof RUBROS)[number]
const ESQUEMA_RUBRO = z.enum(RUBROS)

export function leerRubro(v: unknown): Rubro | null {
  const r = ESQUEMA_RUBRO.safeParse(v)
  return r.success ? r.data : null
}

/** Los rubros que tiene la fila «sin obra asignada»: las horas siempre tienen obra. */
export function esRubroSinObra(r: Rubro | null): r is 'materiales' | 'subcontratos' {
  return r === 'materiales' || r === 'subcontratos'
}

/** El nombre del rubro en la RPC. `mo` viaja corto en la URL y largo en SQL. */
const RUBRO_SQL: Record<Rubro, string> = { materiales: 'materiales', subcontratos: 'subcontratos', mo: 'mano_obra', hh: 'hh' }

/** Cómo se llama la celda, con las MISMAS palabras que el encabezado de la tabla. */
export const ROTULO_RUBRO: Record<Rubro, string> = {
  materiales: ROTULO_MATERIALES, subcontratos: ROTULO_SUBCONTRATOS, mo: ROTULO_MANO_OBRA, hh: 'HH acumuladas',
}

export interface ComprobanteDeDetalle {
  referencia: string | null
  /** La fila de la pestaña Compras: es lo que enlaza a `/administracion/compras?s=`. */
  fila: number | null
  fecha: string | null
  fechaPrevista: string | null
  estado: string | null
  proveedor: string | null
  comprobante: string | null
  concepto: string | null
  total: number
  aLaFecha: number
  porVencer: number
}

export interface QuincenaDePersona {
  personaId: string | null
  nombre: string | null
  quincenaDesde: string
  quincenaHasta: string | null
  horas: number | null
  blanco: number | null
  negro: number | null
  total: number | null
  /** real · estimado · falta_dato, como lo publica `costo_mo_quincena`. */
  estado: string
  origen: string | null
  sellado: boolean
}

export interface PersonaDeHH {
  personaId: string | null
  nombre: string | null
  hh: number | null
  dias: number
  primera: string | null
  ultima: string | null
}

interface DetalleBase {
  corte: string | null
  n: number
}

export type DetalleCosto =
  | (DetalleBase & { rubro: 'materiales' | 'subcontratos'; total: number; porVencer: number; filas: ComprobanteDeDetalle[] })
  | (DetalleBase & {
    rubro: 'mo'; total: number | null; horas: number | null; horasSinTarifa: number | null
    puedeVerTarifas: boolean; filas: QuincenaDePersona[]
  })
  | (DetalleBase & {
    rubro: 'hh'; total: number | null; desde: string | null; hasta: string | null; filas: PersonaDeHH[]
    /** Cuándo se calculó el desglose, si vino de `ficha_cliente_cache`. `null` = se calculó recién. */
    cacheCalculadoEn: string | null
  })

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

function texto(v: unknown): string | null {
  // 400 y no 160: el concepto de una cuota de Tello mide 160 y el title perdía «(vence dd/mm/aaaa)» (QA 15/09).
  return typeof v === 'string' && v !== '' ? v.slice(0, 400) : null
}

function dia(v: unknown): string | null {
  return texto(v)?.slice(0, 10) ?? null
}

function filasDe(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : []
}

function comprobantesDe(v: unknown): ComprobanteDeDetalle[] {
  return filasDe(v).flatMap((r) => {
    const total = num(r.total)
    if (total == null) return []
    // SIN `a_la_fecha` (una respuesta anterior a la migración) el comprobante entra entero: es lo que
    // la celda vieja hacía, y decirlo así es más honesto que dibujar un cero.
    const aLaFecha = num(r.a_la_fecha) ?? total
    return [{
      referencia: texto(r.referencia), fila: num(r.fila), fecha: dia(r.fecha), fechaPrevista: dia(r.fecha_prevista),
      estado: texto(r.estado), proveedor: texto(r.proveedor), comprobante: texto(r.comprobante),
      concepto: texto(r.concepto), total, aLaFecha, porVencer: num(r.por_vencer) ?? total - aLaFecha,
    }]
  })
}

function quincenasDe(v: unknown): QuincenaDePersona[] {
  return filasDe(v).flatMap((r) => {
    const quincenaDesde = dia(r.quincena_desde)
    if (!quincenaDesde) return []
    return [{
      personaId: texto(r.persona_id), nombre: texto(r.nombre), quincenaDesde, quincenaHasta: dia(r.quincena_hasta),
      horas: num(r.horas), blanco: num(r.blanco), negro: num(r.negro), total: num(r.total),
      estado: texto(r.estado) ?? 'falta_dato', origen: texto(r.origen), sellado: r.sellado === true,
    }]
  })
}

function personasDe(v: unknown): PersonaDeHH[] {
  return filasDe(v).map((r) => ({
    personaId: texto(r.persona_id), nombre: texto(r.nombre), hh: num(r.hh), dias: num(r.dias) ?? 0,
    primera: dia(r.primera), ultima: dia(r.ultima),
  }))
}

/**
 * Lo que devuelve la RPC → el detalle. `null` = no puedo verlo (rol sin permiso, rubro desconocido).
 * Un detalle con cero filas NO es `null`: es «esta celda no tiene nada adentro», y se dibuja distinto.
 */
export function armarDetalleCosto(j: unknown): DetalleCosto | null {
  if (j == null || typeof j !== 'object') return null
  const r = j as Record<string, unknown>
  const base: DetalleBase = { corte: dia(r.corte), n: num(r.n) ?? 0 }
  switch (r.rubro) {
    case 'materiales':
    case 'subcontratos':
      return { ...base, rubro: r.rubro, total: num(r.total) ?? 0, porVencer: num(r.por_vencer) ?? 0, filas: comprobantesDe(r.filas) }
    case 'mano_obra':
      return {
        ...base, rubro: 'mo', total: num(r.total), horas: num(r.horas), horasSinTarifa: num(r.horas_sin_tarifa),
        puedeVerTarifas: r.puede_ver_tarifas !== false, filas: quincenasDe(r.filas),
      }
    case 'hh':
      return {
        ...base, rubro: 'hh', total: num(r.total), desde: dia(r.desde), hasta: dia(r.hasta),
        filas: personasDe(r.filas), cacheCalculadoEn: texto(r.cache_calculado_en),
      }
    default:
      return null
  }
}

/** Σ de las filas, sumada ACÁ y no leída del `total`: es el control del panel contra su propia lista. */
export function sumaDeFilas(d: DetalleCosto): number | null {
  const xs: (number | null)[] = d.rubro === 'hh'
    ? d.filas.map((f) => f.hh)
    : d.rubro === 'mo'
      ? d.filas.map((f) => (f.estado === 'falta_dato' ? null : f.total))
      : d.filas.map((f) => f.aLaFecha)
  const ns = xs.filter((x): x is number => x != null)
  return ns.length ? ns.reduce((a, b) => a + b, 0) : null
}

/**
 * ¿EL PANEL CIERRA CON LA CELDA? Al centavo (medio centavo de tolerancia por el redondeo del `numeric`).
 * `celda` en `null` con un total en `null` cierra: los dos dicen «nada». Un total con una celda vacía,
 * o al revés, NO cierra: son dos lecturas distintas del mismo dato y la pantalla tiene que decirlo.
 */
export function cierraConLaCelda(total: number | null, celda: number | null): boolean {
  if (total == null || celda == null) return total == null && celda == null
  return Math.abs(total - celda) < 0.005
}

/**
 * LA SEGUNDA LÍNEA DEL PANEL: «Subcontratos a la fecha · $1.967.272,73 · por vencer $12.666.727,27 ·
 * 10 comprobantes». Lo por vencer se nombra ARRIBA y no sólo en la última columna: es la mitad de la
 * respuesta a «qué está considerando», y era lo que antes entraba sumado al costo. Sin nada por vencer
 * no se escribe: una línea que dice «por vencer $0» es ruido.
 */
export function subtituloDelDetalle(rubro: Rubro, d: DetalleCosto | null): string {
  if (!d) return ROTULO_RUBRO[rubro]
  const n = d.filas.length
  if (d.rubro === 'hh') return `${ROTULO_RUBRO.hh} · ${fmtHH(d.total) ?? '—'} h · ${n} ${n === 1 ? 'persona' : 'personas'}`
  if (d.rubro === 'mo') return `${ROTULO_RUBRO.mo} · ${d.total == null ? 'sin valorizar' : plata(d.total)} · ${n} persona·quincena`
  return [
    ROTULO_RUBRO[d.rubro], plata(d.total),
    ...(d.porVencer ? [`por vencer ${plata(d.porVencer)}`] : []),
    `${n} ${n === 1 ? 'comprobante' : 'comprobantes'}`,
  ].join(' · ')
}

/**
 * QUÉ DICE EL PIE CUANDO EL PANEL NO CIERRA CON LA CELDA. `null` = cierra, y no se escribe nada.
 *
 * ÁMBAR ES PARA UN PROBLEMA, Y UNA CACHÉ NO LO ES. El desglose de HH es el mismo que el de la pantalla
 * `?hh=`, y ésa se sirve de `ficha_cliente_cache` con hasta 10 minutos de antigüedad, mientras la
 * columna HH de la tabla se calcula en vivo: con horas cargadas recién, los dos números difieren sin
 * que nada esté mal (15/09/2026: el panel decía 195 h y la columna 186 h). Decirlo en ámbar sería
 * inventar un descuadre; se dice de cuándo es el desglose, en texto secundario, y se acabó.
 */
export function avisoDeCotejo(
  d: DetalleCosto, total: number | null, celda: number | null, ahora: Date,
): { texto: string; problema: boolean } | null {
  if (cierraConLaCelda(total, celda)) return null
  const f = (n: number | null) => (d.rubro === 'hh' ? `${fmtHH(n) ?? '—'} h` : n == null ? '—' : plata(n))
  const frescura = d.rubro === 'hh' ? frescuraDeLaFicha(d.cacheCalculadoEn, ahora) : null
  return frescura
    ? { texto: `Desglose con ${frescura}; la columna ya dice ${f(celda)}.`, problema: false }
    : { texto: `No cierra con la celda: la celda dice ${f(celda)} y estas filas suman ${f(total)}.`, problema: true }
}

/**
 * EL NÚMERO DE LA CELDA QUE SE ABRIÓ, leído de lo que la tabla ya dibujó (`costo_obra`, `hh_obra`,
 * `costo_sin_obra` de `pantalla_cliente`): es contra lo que el panel se coteja. Si la ficha y el
 * detalle se leyeran de la misma respuesta, el cotejo no controlaría nada.
 */
export function celdaDeCosto(
  p: PedidoDeDetalle | null,
  costos: ReadonlyMap<string, CostoDeObra> | null | undefined,
  horas: ReadonlyMap<string, HorasDeObra> | null | undefined,
  sinObra: GastoSinObra | null | undefined,
): number | null {
  if (!p) return null
  if (!('obraId' in p)) return sinObra?.[p.rubro] ?? null
  const c = costos?.get(p.obraId)
  switch (p.rubro) {
    case 'materiales': return c?.materiales ?? null
    case 'subcontratos': return c?.subcontratos ?? null
    case 'mo': return c?.manoObra ?? null
    case 'hh': return horas?.get(p.obraId)?.hhReal ?? null
  }
}

// ═══ LA LECTURA: UN VIAJE, Y SÓLO CON EL PANEL ABIERTO ═══
//
// No entra en `pantalla_cliente`: el detalle es de UNA celda y se pide con un clic. `null` con `error`
// en `null` = no puedo verlo, y la pantalla lo dice con esas palabras.

export type PedidoDeDetalle =
  | { obraId: string; rubro: Rubro }
  | { clienteSlug: string; rubro: 'materiales' | 'subcontratos' }

export async function leerDetalle(
  supabase: SupabaseClient, pedido: PedidoDeDetalle,
): Promise<{ detalle: DetalleCosto | null; error: string | null }> {
  const { data, error } = 'obraId' in pedido
    ? await supabase.rpc('detalle_costo_de_obra', { p_obra: pedido.obraId, p_rubro: RUBRO_SQL[pedido.rubro] })
    : await supabase.rpc('detalle_costo_sin_obra', { p_cliente: pedido.clienteSlug, p_rubro: pedido.rubro })
  if (error) return { detalle: null, error: error.message }
  return { detalle: armarDetalleCosto(data), error: null }
}
