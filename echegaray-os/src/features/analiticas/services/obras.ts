// CADA OBRA DE LA CARTERA, CON SUS DOS PATAS: LO QUE SE PACTÓ Y LO QUE SE GASTÓ.
//
// ═══ LA REGLA QUE ESTE ARCHIVO DEFIENDE ═══
//
// Ninguna cifra sin sus dos patas, y ninguna ausencia dibujada como cero. Una obra sin contrato no
// está «al 0 %»: está «sin precio». Una obra que no gastó nada no está «dentro»: está «sin movimiento
// todavía». El semáforo sólo pinta lo que puede medir.
//
// ═══ QUÉ ES «PRESUPUESTO» ACÁ ═══
//
// 1. `costo_objetivo` (el costo directo aprobado) cuando existe: es contra lo que se decide gastar.
//    El contrato queda como segunda referencia.
// 2. Si no, el contrato con papel (`obra_contrato`: mano de obra + materiales valuados hoy).
// 3. Si no, el precio que OBRAS o el formulario declaran para la obra — NUNCA la suma viva de
//    Cobranzas: sube cada vez que se factura, así que medir el gasto contra ella da siempre «dentro».
//
// Los números no se calculan acá: los traen `obra_economia_cartera`, `obra_economia` y
// `analiticas_costos` (que es `costo_de_obras_a_la_fecha` con rango). Este archivo decide qué dice
// cada hueco y en qué grupo cae cada obra.
import type { CostoDeObra, GastoSinObra } from '../../clientes/services/costosDeObra.ts'
import type { EconomiaDeObra } from '../../clientes/services/economiaObras.ts'
import type { EstadoObra } from './filtros.ts'
import { millones } from './formato.ts'

/** La fila de `obra_panel` que el módulo usa. */
export interface ObraPanel {
  obra_id: string
  nombre: string
  cliente_id: string | null
  cliente_slug: string | null
  cliente_nombre: string | null
  estado: string | null
  n_comprobantes: number | null
  avance_pct: number | null
}

export type EstadoDeObra = 'curso' | 'terminada' | 'sinIniciar'
export type Grupo = 'pasadas' | 'cerca' | 'dentro' | 'sinPresupuesto'

/** Por qué no hay precio, con la palabra que lo dice. */
export type AusenciaPrecio = 'sin precio' | 'sin valuar'

export interface Gasto {
  manoObra: number | null
  subcontratos: number | null
  materiales: number | null
  /** Σ de las tres. `null` = ninguna de las tres tiene dato: «sin movimiento». */
  total: number | null
  /** Horas cargadas (valorizadas + sin valorizar). `null` = ninguna. */
  horas: number | null
  /** Horas que tienen costo detrás: el divisor honesto del $/hora. */
  horasValorizadas: number | null
  /** Una parte de la mano de obra es estimación (quincena sin recibo): se dice. */
  manoObraEstimada: boolean
}

export interface ObraAnalitica {
  id: string
  nombre: string
  clienteId: string
  clienteSlug: string
  clienteNombre: string
  estado: EstadoDeObra
  contrato: {
    manoObra: number | null
    materiales: number | null
    total: number | null
    /** `true` = hay una fila en `obra_contrato`: el número tiene papel. */
    conPapel: boolean
    /** Materiales pactados en 0 con cita: los pone el cliente. */
    materialesDelCliente: boolean
    cita: string | null
  }
  /** El precio contra el que se mide. `null` → `ausencia` dice por qué. */
  precio: number | null
  ausencia: AusenciaPrecio | null
  costoObjetivo: number | null
  presupuesto: number | null
  gasto: Gasto
  /** gastado ÷ presupuesto. `null` sin presupuesto. */
  avanceGasto: number | null
  grupo: Grupo
}

export const UMBRAL_CERCA = 0.8

const ORIGEN_SUMA_VIVA = 'suma-viva'

export function estadoDe(p: Pick<ObraPanel, 'estado' | 'n_comprobantes' | 'avance_pct'>): EstadoDeObra {
  if (p.estado !== 'activa') return 'terminada'
  // SIN INICIAR = activa y sin ninguna señal de ejecución: ni un comprobante imputado ni avance medido.
  // La base no tiene `fecha_inicio_real` cargada en casi ninguna obra, así que no se usa: daría todas.
  return (p.n_comprobantes ?? 0) === 0 && (p.avance_pct ?? 0) === 0 ? 'sinIniciar' : 'curso'
}

export function pasaEstado(e: EstadoDeObra, filtro: EstadoObra): boolean {
  if (filtro === 'todas') return true
  if (filtro === 'terminadas') return e === 'terminada'
  return filtro === 'sinIniciar' ? e === 'sinIniciar' : e === 'curso'
}

const suma = (...xs: (number | null)[]): number | null =>
  xs.every((x) => x == null) ? null : xs.reduce<number>((a, x) => a + (x ?? 0), 0)

export function gastoDe(c: CostoDeObra | null | undefined): Gasto {
  const horas = c ? suma(c.horasValorizadas, c.horasSinTarifa) : null
  return {
    manoObra: c?.manoObra ?? null,
    subcontratos: c?.subcontratos ?? null,
    materiales: c?.materiales ?? null,
    total: c ? suma(c.manoObra, c.subcontratos, c.materiales) : null,
    horas: horas && horas > 0 ? horas : null,
    horasValorizadas: c?.horasValorizadas && c.horasValorizadas > 0 ? c.horasValorizadas : null,
    manoObraEstimada: (c?.manoObraEstimada ?? 0) > 0,
  }
}

/** El precio y, si no hay, la palabra. */
export function precioDe(e: EconomiaDeObra | null | undefined): { precio: number | null; ausencia: AusenciaPrecio | null } {
  if (!e) return { precio: null, ausencia: 'sin precio' }
  // UNA PATA EN DÓLARES SIN DÓLAR DEL DÍA: el contrato existe, pero no se puede decir en pesos.
  const patasUsd = (e.contrato_mano_obra_usd != null && e.contrato_mano_obra == null)
    || (e.contrato_materiales_usd != null && e.contrato_materiales == null)
  if (e.contrato_total != null && e.contrato_total > 0) return { precio: e.contrato_total, ausencia: null }
  if (patasUsd) return { precio: null, ausencia: 'sin valuar' }
  if (e.contratado != null && e.contratado > 0 && e.origen !== ORIGEN_SUMA_VIVA) return { precio: e.contratado, ausencia: null }
  return { precio: null, ausencia: 'sin precio' }
}

export function grupoDe(presupuesto: number | null, total: number | null): Grupo {
  if (presupuesto == null) return 'sinPresupuesto'
  if (total == null || total <= 0) return 'dentro'
  const r = total / presupuesto
  return r > 1 ? 'pasadas' : r >= UMBRAL_CERCA ? 'cerca' : 'dentro'
}

export function armarObra(
  p: ObraPanel, e: EconomiaDeObra | null | undefined, c: CostoDeObra | null | undefined, costoObjetivo: number | null,
): ObraAnalitica | null {
  if (!p.cliente_id || !p.cliente_slug) return null
  const { precio, ausencia } = precioDe(e)
  const gasto = gastoDe(c)
  const presupuesto = costoObjetivo ?? precio
  return {
    id: p.obra_id, nombre: p.nombre, clienteId: p.cliente_id, clienteSlug: p.cliente_slug,
    clienteNombre: p.cliente_nombre ?? p.cliente_slug, estado: estadoDe(p),
    contrato: {
      manoObra: e?.contrato_mano_obra ?? null,
      materiales: e?.contrato_materiales ?? null,
      total: e?.contrato_total ?? null,
      conPapel: e?.contrato_fuente != null || e?.contrato_cita != null,
      materialesDelCliente: e?.contrato_materiales === 0 && e.contrato_cita != null,
      cita: e?.contrato_cita ?? null,
    },
    precio, ausencia, costoObjetivo, presupuesto, gasto,
    avanceGasto: presupuesto && gasto.total != null ? gasto.total / presupuesto : null,
    grupo: grupoDe(presupuesto, gasto.total),
  }
}

/** La frase del anillo: se pasó, le quedan, sin movimiento o qué falta cargar. */
export function fraseDeObra(o: Pick<ObraAnalitica, 'presupuesto' | 'gasto' | 'grupo'>): string {
  if (o.presupuesto == null) return 'cargar el contrato para poder comparar'
  if (o.gasto.total == null || o.gasto.total <= 0) return 'sin movimiento todavía'
  const d = o.gasto.total - o.presupuesto
  return d > 0 ? `se pasó ${millones(d)}` : `le quedan ${millones(-d)}`
}

export const ORDEN_GRUPOS: { clave: Grupo; rotulo: string }[] = [
  { clave: 'pasadas', rotulo: 'Pasadas' },
  { clave: 'cerca', rotulo: 'Cerca del límite' },
  { clave: 'dentro', rotulo: 'Dentro' },
  { clave: 'sinPresupuesto', rotulo: 'Sin presupuesto' },
]

export function agruparPorSemaforo(obras: ObraAnalitica[]): Map<Grupo, ObraAnalitica[]> {
  const m = new Map<Grupo, ObraAnalitica[]>(ORDEN_GRUPOS.map((g) => [g.clave, []]))
  for (const o of obras) m.get(o.grupo)?.push(o)
  for (const lista of m.values()) lista.sort((a, b) => (b.avanceGasto ?? -1) - (a.avanceGasto ?? -1) || (b.gasto.total ?? 0) - (a.gasto.total ?? 0))
  return m
}

/**
 * ¿ES UN COSTO OBJETIVO DE LA OBRA ENTERA? Sólo el costo directo de un presupuesto APROBADO lo es.
 *
 * `obra_economia` también publica como `costo_objetivo` la suma de «partidas congeladas convertidas a
 * esta obra»: en Quattropani son 2 partidas por $ 1,77 M contra un contrato de $ 139 M, y el semáforo
 * la daba «pasada al 2.544 %». Un pedazo de presupuesto no es el presupuesto: medir contra él
 * fabrica un desvío. Hasta que la conversión cubra la obra, manda el contrato.
 */
export function costoObjetivoValido(valor: number | null, origen: string | null | undefined): number | null {
  if (valor == null || valor <= 0) return null
  return /^costo directo del presupuesto .*aprobado/i.test(origen ?? '') ? valor : null
}

/** El total de lo sin obra de un cliente (materiales + subcontratos). Nunca se reparte entre obras. */
export function sinObraDe(g: GastoSinObra | null | undefined): number | null {
  if (!g) return null
  return suma(g.materiales, g.subcontratos)
}
