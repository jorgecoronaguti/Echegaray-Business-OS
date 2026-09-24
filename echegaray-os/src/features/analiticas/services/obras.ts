// CADA OBRA DE LA CARTERA, CON SUS DOS PATAS: LO QUE SE PRESUPUESTÓ Y LO QUE SE CONSUMIÓ.
//
// ═══ LA REGLA QUE ESTE ARCHIVO DEFIENDE ═══
//
// Ninguna cifra sin sus dos patas, y ninguna ausencia dibujada como cero. Una obra sin presupuesto no
// está «al 0 %»: está «sin presupuesto cargado». Una obra que no gastó nada no está «dentro»: está «sin
// movimiento todavía». El semáforo sólo pinta lo que puede medir.
//
// ═══ QUÉ ES «PRESUPUESTO» ACÁ ═══
//
// El COSTO previsto por rubro que publica `presupuesto.ts` (una sola fuente: el presupuesto aprobado
// de `presupuestos`, con cita de celda), comparado RUBRO CONTRA RUBRO: `presupuesto` es la suma de los
// rubros que tienen consumo con el que compararse (mano de obra y materiales), y `consumoComparable`
// lo gastado en ESOS rubros. Una obra que sólo cotizó MO+CS no se mide con sus materiales adentro. NUNCA el contrato: el contrato es el precio de venta, y medir el gasto contra él
// esconde el margen en el «queda» (dueño, 17/09/2026). El contrato —y el precio que OBRAS o el
// formulario declaran, nunca la suma viva de Cobranzas— se sigue leyendo, como referencia al lado.
//
// Los números no se calculan acá: los traen `obra_economia_cartera`, `analiticas_costos` y el lector
// de presupuestos. Este archivo decide qué dice cada hueco y en qué grupo cae cada obra.
import type { CostoDeObra, GastoSinObra } from '../../clientes/services/costosDeObra.ts'
import type { EconomiaDeObra } from '../../clientes/services/economiaObras.ts'
import type { EstadoObra } from './filtros.ts'
import { millones } from './formato.ts'
import { RUBROS_COMPARABLES, SIN_PRESUPUESTO, type PresupuestoArmado, type Rubro } from './presupuesto.ts'
import { clienteDeObra } from '../../../shared/clientes/nombre.ts'

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
  /** El orden manual de la obra, el mismo que usa Clientes. */
  orden?: number | null
  /** La obra mayor de la que es adicional. */
  obra_padre_id?: string | null
}

export type EstadoDeObra = 'curso' | 'terminada' | 'sinIniciar'
export type Grupo = 'pasadas' | 'cerca' | 'dentro' | 'sinMovimiento' | 'sinPresupuesto'

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
  /**
   * La parte de `manoObra` que es ESTIMACIÓN (quincenas sin recibo del estudio: horas × tarifa).
   * El 17/09/2026 era el 77 % de la mano de obra de la cartera: una cifra que no la dice se lee como
   * medida (auditoría, D2). `null` = ninguna parte estimada o sin mano de obra.
   */
  manoObraEstimada: number | null
}

export interface ObraAnalitica {
  id: string
  nombre: string
  orden: number | null
  padreId: string | null
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
  /** El precio de venta, SÓLO como referencia. `null` → `ausencia` dice por qué. */
  precio: number | null
  ausencia: AusenciaPrecio | null
  /** Σ del presupuesto de los rubros comparables: contra esto se mide. `null` = nada que comparar. */
  presupuesto: number | null
  /** Lo gastado en los rubros que tienen presupuesto comparable. */
  consumoComparable: number | null
  /** El costo cotizado total de la cotización aprobada (todos los rubros). Para mostrar, no para medir. */
  costoCotizado: number | null
  /** Por qué no hay presupuesto: el motivo de la base, o `sin presupuesto cargado`. `null` si hay. */
  motivoPresupuesto: string | null
  /** El presupuesto por rubro; `null` = la obra no tiene presupuesto aprobado. */
  presupuestoRubros: Record<Rubro, number | null> | null
  /** Rubros cuyo presupuesto es INFERENCIA; `estimado` = la cabecera lo es. */
  rubrosEstimados: Rubro[]
  presupuestoEstimado: boolean
  /** Horas hombre de la cotización aprobada. `null` = sin previsión. */
  hhPresupuestadas: number | null
  /** La cita de la cotización aprobada (archivo, drive, celda). */
  fuentePresupuesto: string | null
  gasto: Gasto
  /** consumoComparable ÷ presupuesto. `null` sin las dos patas. */
  avanceGasto: number | null
  grupo: Grupo
}

export const UMBRAL_CERCA = 0.8

/**
 * LOS RUBROS DE CONSUMO QUE SE MIDEN CONTRA EL PRESUPUESTO. MO+CS cotizado → mano de obra. MA de la
 * plantilla = materiales + equipos + fletes + SUBCONTRATOS (no los separa) → materiales Y subcontratos
 * (decisión 17/09/2026). Lo usan el «queda» y el ritmo del «alcanza»: los dos miden lo mismo.
 */
export function rubrosComparables(porRubro: Record<Rubro, number | null> | null): ('manoObra' | 'materiales' | 'subcontratos')[] {
  const out: ('manoObra' | 'materiales' | 'subcontratos')[] = []
  if ((porRubro?.manoObra ?? 0) > 0) out.push('manoObra')
  if ((porRubro?.materiales ?? 0) > 0) out.push('materiales', 'subcontratos')
  return out
}

const ORIGEN_SUMA_VIVA = 'suma-viva'

export function estadoDe(p: Pick<ObraPanel, 'estado' | 'n_comprobantes' | 'avance_pct'>): EstadoDeObra {
  if (p.estado !== 'activa') return 'terminada'
  // SIN INICIAR = activa y sin ninguna señal de ejecución: ni un comprobante imputado ni avance medido.
  // La base no tiene `fecha_inicio_real` cargada en casi ninguna obra, así que no se usa: daría todas.
  return (p.n_comprobantes ?? 0) === 0 && (p.avance_pct ?? 0) === 0 ? 'sinIniciar' : 'curso'
}

/**
 * «EN CURSO» ES LO ACTIVO, COMO EN CLIENTES (dueño, 17/09/2026): incluye las activas que todavía no
 * consumieron (Playón de azufre, Adicional tercer muro). «Sin iniciar» sigue existiendo como recorte.
 */
export function pasaEstado(e: EstadoDeObra, filtro: EstadoObra): boolean {
  if (filtro === 'todas') return true
  if (filtro === 'terminadas') return e === 'terminada'
  return filtro === 'sinIniciar' ? e === 'sinIniciar' : e !== 'terminada'
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
    manoObraEstimada: c?.manoObraEstimada && c.manoObraEstimada > 0 ? c.manoObraEstimada : null,
  }
}

/** Qué fracción de la mano de obra es estimada (0–1), o `null` sin mano de obra. */
export function proporcionEstimada(g: Pick<Gasto, 'manoObra' | 'manoObraEstimada'>): number | null {
  if (!g.manoObra || g.manoObra <= 0) return null
  return Math.min(1, (g.manoObra ? (g.manoObraEstimada ?? 0) / g.manoObra : 0))
}

/** «62 % estimada», o `null` si no hay nada estimado: el rótulo que acompaña a toda cifra de mano de obra. */
export function rotuloEstimada(g: Pick<Gasto, 'manoObra' | 'manoObraEstimada'>): string | null {
  const p = proporcionEstimada(g)
  return p != null && p > 0 ? `${Math.max(1, Math.round(p * 100))} % estimada` : null
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
  // SIN GASTO NO ESTÁ «DENTRO»: no hay nada medido contra el presupuesto (auditoría 17/09/2026, D5).
  if (total == null || total <= 0) return 'sinMovimiento'
  const r = total / presupuesto
  return r > 1 ? 'pasadas' : r >= UMBRAL_CERCA ? 'cerca' : 'dentro'
}

export function armarObra(
  p: ObraPanel, e: EconomiaDeObra | null | undefined, c: CostoDeObra | null | undefined, armado: PresupuestoArmado | null,
): ObraAnalitica | null {
  if (!p.cliente_id || !p.cliente_slug) return null
  const { precio, ausencia } = precioDe(e)
  const gasto = gastoDe(c)
  const comparables = RUBROS_COMPARABLES.filter((k) => (armado?.porRubro[k] ?? 0) > 0)
  const presupuesto = comparables.length ? comparables.reduce((a, k) => a + (armado?.porRubro[k] ?? 0), 0) : null
  const consumoComparable = comparables.length ? suma(...rubrosComparables(armado?.porRubro ?? null).map((k) => gasto[k])) : null
  return {
    id: p.obra_id, nombre: p.nombre, clienteId: p.cliente_id, clienteSlug: p.cliente_slug,
    orden: p.orden ?? null, padreId: p.obra_padre_id ?? null,
    clienteNombre: clienteDeObra(p) ?? 'cliente sin nombre', estado: estadoDe(p),
    contrato: {
      manoObra: e?.contrato_mano_obra ?? null,
      materiales: e?.contrato_materiales ?? null,
      total: e?.contrato_total ?? null,
      conPapel: e?.contrato_fuente != null || e?.contrato_cita != null,
      materialesDelCliente: e?.contrato_materiales === 0 && e.contrato_cita != null,
      cita: e?.contrato_cita ?? null,
    },
    precio, ausencia, presupuesto, consumoComparable, gasto,
    costoCotizado: armado?.costoTotal ?? null,
    motivoPresupuesto: presupuesto != null ? null : armado?.motivo ?? (armado ? 'presupuesto sin desglose por rubro' : SIN_PRESUPUESTO),
    presupuestoRubros: armado ? { ...armado.porRubro } : null,
    rubrosEstimados: armado?.estimados ?? [],
    presupuestoEstimado: armado?.estimado ?? false,
    hhPresupuestadas: armado?.hh ?? null,
    fuentePresupuesto: armado?.fuente || null,
    avanceGasto: presupuesto && consumoComparable != null ? consumoComparable / presupuesto : null,
    grupo: grupoDe(presupuesto, consumoComparable),
  }
}

/** La frase de la obra: se pasó, le quedan, sin movimiento o qué falta cargar. */
export function fraseDeObra(o: Pick<ObraAnalitica, 'presupuesto' | 'consumoComparable' | 'motivoPresupuesto' | 'grupo'>): string {
  if (o.presupuesto == null) return o.motivoPresupuesto ?? SIN_PRESUPUESTO
  if (o.consumoComparable == null || o.consumoComparable <= 0) return 'sin movimiento todavía'
  const d = o.consumoComparable - o.presupuesto
  return d > 0 ? `se pasó ${millones(d)}` : `le quedan ${millones(-d)}`
}

export const ORDEN_GRUPOS: { clave: Grupo; rotulo: string }[] = [
  { clave: 'pasadas', rotulo: 'Pasadas' },
  { clave: 'cerca', rotulo: 'Cerca del límite' },
  { clave: 'dentro', rotulo: 'Dentro' },
  { clave: 'sinMovimiento', rotulo: 'Sin movimiento' },
  { clave: 'sinPresupuesto', rotulo: 'Sin presupuesto' },
]

/** LA OBRA DE LA VISTA OBRAS: la pedida si pasa los filtros; si no, la que más consumió. */
export function elegirObra(obras: ObraAnalitica[], pedida: string | null): ObraAnalitica | null {
  return obras.find((o) => o.id === pedida)
    ?? [...obras].sort((a, b) => (b.gasto.total ?? 0) - (a.gasto.total ?? 0) || a.nombre.localeCompare(b.nombre))[0]
    ?? null
}

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
 * fabrica un desvío. Queda para cuando el presupuesto se conecte (`presupuesto.ts`): un `costo_objetivo`
 * parcial no puede entrar como presupuesto de la obra.
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
