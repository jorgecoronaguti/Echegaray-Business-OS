// LA OBRA EN LOS CUATRO RUBROS, PARA LA FICHA — las MISMAS dos fuentes que Analíticas.
//
// ═══ POR QUÉ (auditoría 18/09/2026, D1 · D2 · D3) ═══
//
// La ficha de la obra comparaba peras con manzanas: «Costo real a hoy» salía de `obra_costo_real`
// (comprobantes con IVA, con lo por vencer, SIN mano de obra) y «Costo objetivo» era el presupuesto,
// que SÍ incluye $ 39,35 M de mano de obra en Quattropani. El desvío daba −$ 40,99 M · −49 % en verde. Y
// el margen cotizado de la ficha no era el del chat. Esta lectura trae, de las fuentes únicas:
//
//   presupuestado, por rubro y total  → `obra_economia_rubros` (lo leído del documento de cotización)
//   margen cotizado                   → `obra_economia_rubros.margen_cotizado` (la única definición)
//   consumido, por rubro, SIN IVA     → `costo_de_obras_por_rubro` (lo mismo que Analíticas)
//
// y compara lo mismo contra lo mismo: el consumido de los rubros que tienen presupuesto contra ese
// presupuesto. Pura: convierte filas; no calcula nada que la base no haya calculado, salvo las sumas.
import type { SupabaseClient } from '@supabase/supabase-js'

export type RubroDeObra = 'mano_obra' | 'materiales' | 'subcontratistas' | 'otros'
export const RUBROS_DE_OBRA: readonly RubroDeObra[] = ['mano_obra', 'materiales', 'subcontratistas', 'otros']
/** Los mismos rótulos que Analíticas (`presupuesto.ts` → RUBROS). */
export const ROTULO_RUBRO_OBRA: Record<RubroDeObra, string> = { mano_obra: 'Mano de obra', materiales: 'Materiales', subcontratistas: 'Subcontratistas', otros: 'Otros' }

export interface RubrosDeLaObra {
  /** Σ de los rubros con presupuesto. `null` → `motivo`. */
  presupuestado: number | null
  presupuestadoPorRubro: Record<RubroDeObra, number | null>
  /** Por qué no hay presupuesto (el de la base), o `null` si hay. */
  motivo: string | null
  /** «Cotizacion Final.xlsm + materiales: CONTRATO… · 27/07/2026». */
  fuente: string | null
  /** Consumido en los CUATRO rubros, sin IVA. `null` = ningún movimiento. */
  consumido: number | null
  consumidoPorRubro: Record<RubroDeObra, number | null>
  /** Consumido SÓLO en los rubros que tienen presupuesto: contra esto se mide. */
  consumidoComparable: number | null
  /** La parte estimada de la mano de obra consumida (quincenas sin recibo). */
  manoObraEstimada: number | null
  margenCotizado: number | null
  gastosGenerales: number | null
}

const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const suma = (xs: (number | null)[]): number | null => (xs.every((x) => x == null) ? null : xs.reduce<number>((a, x) => a + (x ?? 0), 0))
const fechaCorta = (iso: unknown): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof iso === 'string' ? iso : '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}

/**
 * `vista` = la fila de `obra_economia_rubros` (o `null`: el rol no la ve, o no se pudo leer).
 * `consumo` = las filas de `costo_de_obras_por_rubro` para esta obra (o `null`: no se pudo leer).
 * Devuelve `null` si no se pudo leer NINGUNA de las dos: «no puedo decirlo», no «no hay nada».
 */
export function armarRubrosDeLaObra(vista: Record<string, unknown> | null, consumo: unknown[] | null): RubrosDeLaObra | null {
  if (vista == null && consumo == null) return null
  const leido = vista?.presupuesto_estado === 'leido'
  const presupuestadoPorRubro: Record<RubroDeObra, number | null> = {
    mano_obra: leido ? num(vista?.presupuestado_mano_obra) : null,
    materiales: leido ? num(vista?.presupuestado_materiales) : null,
    subcontratistas: leido ? num(vista?.presupuestado_subcontratistas) : null,
    otros: leido ? num(vista?.presupuestado_otros) : null,
  }
  const consumidoPorRubro: Record<RubroDeObra, number | null> = { mano_obra: null, materiales: null, subcontratistas: null, otros: null }
  let manoObraEstimada: number | null = null
  for (const c of consumo ?? []) {
    const r = (c ?? {}) as Record<string, unknown>
    if (typeof r.rubro !== 'string' || !(RUBROS_DE_OBRA as readonly string[]).includes(r.rubro)) continue
    consumidoPorRubro[r.rubro as RubroDeObra] = num(r.monto)
    if (r.rubro === 'mano_obra') manoObraEstimada = num(r.monto_estimado)
  }
  const conPresupuesto = RUBROS_DE_OBRA.filter((k) => presupuestadoPorRubro[k] != null)
  const presupuestado = conPresupuesto.length ? suma(conPresupuesto.map((k) => presupuestadoPorRubro[k])) : null
  const fuente = leido ? [vista?.presupuesto_fuente_nombre, fechaCorta(vista?.presupuesto_fecha)].filter(Boolean).join(' · ') || null : null
  return {
    presupuestado, presupuestadoPorRubro,
    motivo: presupuestado != null ? null : (typeof vista?.presupuesto_motivo === 'string' ? vista.presupuesto_motivo : 'sin presupuesto leído para esta obra'),
    fuente,
    consumido: consumo == null ? null : suma(RUBROS_DE_OBRA.map((k) => consumidoPorRubro[k])),
    consumidoPorRubro,
    consumidoComparable: consumo == null || !conPresupuesto.length ? null : suma(conPresupuesto.map((k) => consumidoPorRubro[k])),
    manoObraEstimada,
    margenCotizado: num(vista?.margen_cotizado),
    gastosGenerales: num(vista?.gastos_generales_cotizados),
  }
}

export const COLUMNAS_VISTA_RUBROS = 'obra_canonica_id, presupuesto_estado, presupuesto_motivo, presupuestado_total, '
  + 'presupuestado_mano_obra, presupuestado_materiales, presupuestado_subcontratistas, presupuestado_otros, '
  + 'presupuesto_fuente_nombre, presupuesto_fecha, margen_cotizado, gastos_generales_cotizados'

export async function leerRubrosDeLaObra(supabase: SupabaseClient, obraId: string): Promise<RubrosDeLaObra | null> {
  const [vista, consumo] = await Promise.all([
    supabase.from('obra_economia_rubros').select(COLUMNAS_VISTA_RUBROS).eq('obra_canonica_id', obraId).maybeSingle(),
    supabase.rpc('costo_de_obras_por_rubro', { p_obras: [obraId], p_desde: null, p_hasta: null, p_neto: true }),
  ])
  return armarRubrosDeLaObra(vista.error ? null : ((vista.data ?? null) as Record<string, unknown> | null),
    consumo.error || !Array.isArray(consumo.data) ? null : consumo.data)
}
