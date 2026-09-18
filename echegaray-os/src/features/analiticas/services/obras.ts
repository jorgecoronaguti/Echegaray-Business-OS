// CADA OBRA DE LA CARTERA, CON SUS DOS PATAS: LO QUE SE PRESUPUESTÓ Y LO QUE SE CONSUMIÓ.
//
// ═══ LA REGLA QUE ESTE ARCHIVO DEFIENDE ═══
//
// Ninguna cifra sin sus dos patas, y ninguna ausencia dibujada como cero. Una obra sin presupuesto no
// está «al 0 %»: está «sin presupuesto cargado». Una obra que no gastó nada no está «dentro»: está «sin
// movimiento todavía». El semáforo sólo pinta lo que puede medir.
//
// ═══ QUÉ ES «PRESUPUESTO» ACÁ (dueño, 18/09/2026) ═══
//
// El COSTO previsto en el documento de cotización de la obra, abierto en los CUATRO rubros del gasto
// —mano de obra, materiales, subcontratistas, otros— por `obra_economia_rubros` (una sola fuente, con
// el detalle y la cita del documento). La comparación es RUBRO CONTRA RUBRO: `presupuesto` es la suma
// de los rubros que tienen monto, y `consumoComparable` lo gastado en ESOS rubros. Una obra que sólo
// cotizó mano de obra (Quattropani, Entrepiso) no se mide con sus materiales adentro: el rubro dice
// por qué no tiene presupuesto. NUNCA el contrato: el contrato es el precio de venta, y medir el gasto
// contra él esconde el margen en el «queda» (dueño, 17/09/2026). El contrato se lee de la MISMA vista
// (`contratado_de_obra`, la definición de obra_panel, la ficha y el CRM) y viaja como referencia.
//
// Los números no se calculan acá: los traen `obra_economia_rubros`, `analiticas_costos` y
// `costo_de_obras_por_rubro`. Este archivo decide qué dice cada hueco y en qué grupo cae cada obra.
import type { CostoDeObra, GastoSinObra } from '../../clientes/services/costosDeObra.ts'
import type { EstadoObra } from './filtros.ts'
import { millones } from './formato.ts'
import type { ConsumoRubro } from './consumo.ts'
import { RUBROS, SIN_PRESUPUESTO, type ContratoLeido, type FilaRubros, type PresupuestoArmado, type Rubro, type RubroPresupuestado } from './presupuesto.ts'

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
  /** Equipos, combustible, fletes, servicios (20260918T0900). `null` = la base no lo publica o no hay. */
  otros: number | null
  /** Σ de los cuatro. `null` = ninguno tiene dato: «sin movimiento». */
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
    /** `true` = hay un papel detrás (contrato desglosado, OC o cotización): el número tiene cita. */
    conPapel: boolean
    /** Materiales pactados en 0 con cita: los pone el cliente. */
    materialesDelCliente: boolean
    cita: string | null
    /** Por qué camino salió el contratado: contrato · oc · presupuesto · formulario · suma-viva. */
    origen: string | null
  }
  /**
   * EL PRECIO DE VENTA: lo que el cliente se comprometió a pagar. Es `contratado_de_obra` (la misma
   * cifra que el CRM y la ficha), salvo que su origen sea una `suma-viva` de Cobranzas: eso es lo
   * facturado, y acá no se llama precio (`precioDe`). `null` → `ausencia` dice por qué.
   */
  precio: number | null
  ausencia: AusenciaPrecio | null
  /** `true` = el contrato está en dólares y `precio` es su valuación al tipo de cambio de hoy. */
  precioEnDolares: boolean
  /** Σ del presupuesto de los rubros con monto: contra esto se mide. `null` = nada que comparar. */
  presupuesto: number | null
  /** Lo gastado en los rubros que tienen presupuesto. */
  consumoComparable: number | null
  /** El costo cotizado total del documento (todos los rubros). Para mostrar, no para medir. */
  costoCotizado: number | null
  /** Por qué no hay presupuesto: el motivo de la base, o `sin presupuesto cargado`. `null` si hay. */
  motivoPresupuesto: string | null
  /** El presupuesto por rubro; `null` = la obra no tiene presupuesto. */
  presupuestoRubros: Record<Rubro, number | null> | null
  /** Cada rubro con su monto, motivo, detalle y cita. `null` = sin presupuesto. */
  presupuestoDetalle: Record<Rubro, RubroPresupuestado> | null
  /** Lo consumido por rubro con su detalle (familias, proveedores, quincenas). `null` = no se leyó. */
  consumoDetalle: Record<Rubro, ConsumoRubro | null> | null
  /** Rubros cuyo presupuesto es INFERENCIA; `estimado` = alguno lo es. */
  rubrosEstimados: Rubro[]
  presupuestoEstimado: boolean
  /** Horas hombre de la cotización aprobada. `null` = sin previsión. */
  hhPresupuestadas: number | null
  /** El documento del que salió el presupuesto: «Cotizacion Final.xlsm · 27/07/2026». */
  fuentePresupuesto: string | null
  fuentePresupuestoDriveId: string | null
  gasto: Gasto
  /** consumoComparable ÷ presupuesto. `null` sin las dos patas. */
  avanceGasto: number | null
  grupo: Grupo
}

export const UMBRAL_CERCA = 0.8

/** LOS RUBROS QUE SE MIDEN CONTRA EL PRESUPUESTO: los que tienen monto (0 incluido: previsto en cero). */
export function rubrosComparables(porRubro: Record<Rubro, number | null> | null): Rubro[] {
  return RUBROS.map((k) => k.clave).filter((k) => porRubro?.[k] != null)
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
    otros: c?.otros ?? null,
    total: c ? suma(c.manoObra, c.subcontratos, c.materiales, c.otros) : null,
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

/**
 * EL PRECIO Y, SI NO HAY, LA PALABRA. El número es `contratado` de la vista (la definición única);
 * lo único que se decide acá es que una `suma-viva` de Cobranzas no es un precio.
 */
export function precioDe(c: ContratoLeido | null | undefined): { precio: number | null; ausencia: AusenciaPrecio | null } {
  if (!c) return { precio: null, ausencia: 'sin precio' }
  if (c.contratado != null && c.contratado > 0 && c.origen !== ORIGEN_SUMA_VIVA) return { precio: c.contratado, ausencia: null }
  // UNA PATA EN DÓLARES SIN DÓLAR DEL DÍA: el contrato existe, pero no se puede decir en pesos.
  const patasUsd = (c.manoObraUsd != null && c.manoObra == null) || (c.materialesUsd != null && c.materiales == null) || (c.contratadoUsd != null && c.contratado == null)
  if (patasUsd) return { precio: null, ausencia: 'sin valuar' }
  return { precio: null, ausencia: 'sin precio' }
}

export function grupoDe(presupuesto: number | null, total: number | null): Grupo {
  if (presupuesto == null) return 'sinPresupuesto'
  // SIN GASTO NO ESTÁ «DENTRO»: no hay nada medido contra el presupuesto (auditoría 17/09/2026, D5).
  if (total == null || total <= 0) return 'sinMovimiento'
  if (presupuesto <= 0) return 'pasadas'
  const r = total / presupuesto
  return r > 1 ? 'pasadas' : r >= UMBRAL_CERCA ? 'cerca' : 'dentro'
}

export function armarObra(
  p: ObraPanel, fila: FilaRubros | null | undefined, c: CostoDeObra | null | undefined, consumo: Record<Rubro, ConsumoRubro | null> | null = null,
): ObraAnalitica | null {
  if (!p.cliente_id || !p.cliente_slug) return null
  const k = fila?.contrato ?? null
  const armado: PresupuestoArmado | null = fila?.presupuesto ?? null
  const { precio, ausencia } = precioDe(k)
  const precioEnDolares = precio != null && (k?.contratadoUsd != null || k?.manoObraUsd != null || k?.materialesUsd != null)
  const gasto = gastoDe(c)
  const comparables = rubrosComparables(armado?.porRubro ?? null)
  const presupuesto = comparables.length ? comparables.reduce((a, r) => a + (armado?.porRubro[r] ?? 0), 0) : null
  const consumoComparable = comparables.length ? suma(...comparables.map((r) => gasto[r])) : null
  return {
    id: p.obra_id, nombre: p.nombre, clienteId: p.cliente_id, clienteSlug: p.cliente_slug,
    orden: p.orden ?? null, padreId: p.obra_padre_id ?? null,
    clienteNombre: p.cliente_nombre ?? p.cliente_slug, estado: estadoDe(p),
    contrato: {
      manoObra: k?.manoObra ?? null,
      materiales: k?.materiales ?? null,
      total: k?.total ?? null,
      conPapel: k?.cita != null || (k?.origen != null && k.origen !== ORIGEN_SUMA_VIVA && k.origen !== 'formulario'),
      materialesDelCliente: k?.materiales === 0 && k.cita != null,
      cita: k?.cita ?? null,
      origen: k?.origen ?? null,
    },
    precio, ausencia, precioEnDolares, presupuesto, consumoComparable, gasto,
    costoCotizado: armado?.costoTotal ?? null,
    motivoPresupuesto: presupuesto != null ? null : armado?.motivo ?? SIN_PRESUPUESTO,
    presupuestoRubros: armado?.costoTotal != null ? { ...armado.porRubro } : null,
    presupuestoDetalle: armado?.costoTotal != null ? armado.rubros : null,
    consumoDetalle: consumo,
    rubrosEstimados: armado?.estimados ?? [],
    presupuestoEstimado: armado?.estimado ?? false,
    hhPresupuestadas: armado?.hh ?? null,
    fuentePresupuesto: armado?.fuente || null,
    fuentePresupuestoDriveId: armado?.fuenteDriveId ?? null,
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
 * fabrica un desvío.
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
