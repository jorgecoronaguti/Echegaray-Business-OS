// C02 · CREAR DESDE EL PRESUPUESTO — las partidas agrupadas por rubro, con lo que cada una trae. PURO.
//
// Partida → historia; el rubro del presupuesto → rubro de la obra; unidad y cantidad se conservan; las
// HH salen del análisis (hs unitarias × cantidad) y sin análisis entran sin HH plan. Lo que ya se
// convirtió no se ofrece dos veces: la conversión de Postgres lo rechaza igual, y acá se dice antes.

export interface PartidaParaConvertir {
  id: string
  rubro: string
  codigo: string | null
  descripcion: string
  unidad: string | null
  cantidad: number | null
  /** hs unitarias × cantidad × coeficiente de ajuste. null = sin análisis. */
  hh: number | null
  /** Las hs por unidad del análisis (C04 «del análisis · 2,5 HH/m³»). */
  hsUnitarias: number | null
  /** costo unitario × cantidad × coeficiente de ajuste. null = sin costo congelado. */
  costo: number | null
  sinAnalisis: boolean
  /** Ya tiene actividades en la obra: no se puede volver a convertir. */
  convertida: boolean
  /** Sin cantidad no hay reparto que cerrar: la conversión no corre. */
  sinCantidad: boolean
}

export interface FilaCruda {
  id: string
  rubro: string | null
  codigo: string | null
  descripcion: string
  unidad: string | null
  cantidad: number | null
  hs_unitarias: number | null
  costo_unitario: number | null
  /** «COEF. AJUSTE» de la partida (planilla de cotización, col. G). Ausente o null = 1. */
  coef_ajuste?: number | null
  orden: number
}

/** El coeficiente de ajuste válido de una partida: sin dato (o no positivo) es 1, nunca 0. */
export function coefDe(coef: number | null | undefined): number {
  return coef != null && Number.isFinite(coef) && coef > 0 ? coef : 1
}

export interface ComponenteMO { tipo: string | null; cantidad: unknown; costo_unitario: unknown; desperdicio: unknown }

/**
 * COSTO DE MO DE LA PARTIDA = Σ (mano de obra + carga social) de la composición por unidad × cantidad ×
 * coeficiente de ajuste. El coeficiente es el de la planilla de cotización: la MO y las cargas de la
 * partida lo llevan igual que su subtotal. null = sin composición de MO o sin cantidad (nunca 0 inventado).
 */
export function costoMODeLaPartida(comp: readonly ComponenteMO[], cantidad: number | null, coef?: number | null): number | null {
  if (cantidad == null) return null
  let unit: number | null = null
  for (const c of comp) {
    if (c.tipo !== 'mano_obra' && c.tipo !== 'carga_social') continue
    if (c.cantidad == null || c.costo_unitario == null) continue
    unit = (unit ?? 0) + Number(c.cantidad) * Number(c.costo_unitario) * (1 + Number(c.desperdicio ?? 0))
  }
  return unit == null ? null : Math.round(unit * cantidad * coefDe(coef))
}

export function partidasParaConvertir(filas: readonly FilaCruda[], convertidas: ReadonlySet<string>): PartidaParaConvertir[] {
  return [...filas].sort((a, b) => a.orden - b.orden).map((f) => ({
    id: f.id,
    rubro: f.rubro?.trim() || 'Sin rubro',
    codigo: f.codigo,
    descripcion: f.descripcion,
    unidad: f.unidad,
    cantidad: f.cantidad,
    hh: f.hs_unitarias != null && f.cantidad != null ? Math.round(f.hs_unitarias * f.cantidad * coefDe(f.coef_ajuste)) : null,
    hsUnitarias: f.hs_unitarias,
    costo: f.costo_unitario != null && f.cantidad != null ? f.costo_unitario * f.cantidad * coefDe(f.coef_ajuste) : null,
    sinAnalisis: f.hs_unitarias == null,
    convertida: convertidas.has(f.id),
    sinCantidad: f.cantidad == null,
  }))
}

export type FiltroPartidas = 'todas' | 'sin_elegir' | 'sin_analisis'

export const FILTROS_PARTIDAS: readonly { id: FiltroPartidas; label: string }[] = [
  { id: 'todas', label: 'Todas' }, { id: 'sin_elegir', label: 'Sin elegir' }, { id: 'sin_analisis', label: 'Sin análisis' },
]

export interface GrupoDePartidas {
  rubro: string
  /** «01 · Obra gruesa»: el número de orden del rubro dentro del presupuesto. */
  rotulo: string
  partidas: PartidaParaConvertir[]
  n: number
  elegidas: number
}

/** Los rubros en el orden en que aparecen, con sus partidas filtradas y los conteos SIN filtrar. */
export function agruparPartidas(
  partidas: readonly PartidaParaConvertir[], elegidas: ReadonlySet<string>, filtro: FiltroPartidas, query: string,
): GrupoDePartidas[] {
  const q = query.trim().toLowerCase()
  const grupos: GrupoDePartidas[] = []
  for (const p of partidas) {
    let g = grupos.find((x) => x.rubro === p.rubro)
    if (!g) {
      g = { rubro: p.rubro, rotulo: `${String(grupos.length + 1).padStart(2, '0')} · ${p.rubro}`, partidas: [], n: 0, elegidas: 0 }
      grupos.push(g)
    }
    g.n++
    if (elegidas.has(p.id)) g.elegidas++
    const pasaFiltro = filtro === 'todas' || (filtro === 'sin_elegir' ? !elegidas.has(p.id) : p.sinAnalisis)
    const pasaTexto = !q || p.descripcion.toLowerCase().includes(q) || (p.codigo ?? '').toLowerCase().includes(q)
    if (pasaFiltro && pasaTexto) g.partidas.push(p)
  }
  return grupos
}

/** Lo que se puede elegir: ni convertidas ni sin cantidad. */
export function elegibles(partidas: readonly PartidaParaConvertir[]): string[] {
  return partidas.filter((p) => !p.convertida && !p.sinCantidad).map((p) => p.id)
}

export interface ResumenConversion {
  partidas: number
  elegidas: number
  /** HH del análisis de las elegidas. null = ninguna elegida tiene análisis. */
  hh: number | null
  sinAnalisis: number
}

export function resumenDeConversion(partidas: readonly PartidaParaConvertir[], elegidas: ReadonlySet<string>): ResumenConversion {
  const sel = partidas.filter((p) => elegidas.has(p.id))
  const hh = sel.reduce<number | null>((s, p) => p.hh == null ? s : (s ?? 0) + p.hh, null)
  return { partidas: partidas.length, elegidas: sel.length, hh, sinAnalisis: sel.filter((p) => p.sinAnalisis).length }
}

/** «2 partidas sin análisis entran sin HH plan» · null cuando todas tienen. */
export function avisoSinAnalisis(r: ResumenConversion): string | null {
  if (r.sinAnalisis === 0) return null
  return `${r.sinAnalisis} ${r.sinAnalisis === 1 ? 'partida sin análisis entra' : 'partidas sin análisis entran'} sin HH plan`
}

/** «Convertir 14 partidas en plan» · «Convertir 14 partidas» · «Elegí partidas». */
export function rotuloConvertir(n: number, largo: boolean): string {
  if (n === 0) return 'Elegí partidas'
  return `Convertir ${n} ${n === 1 ? 'partida' : 'partidas'}${largo ? ' en plan' : ''}`
}
