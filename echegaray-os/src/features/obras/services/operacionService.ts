// MÓDULO 01 — OBRAS · OPERACIÓN. Qué pidió, qué compró y qué recursos se movieron para esta obra.
//
// ═══ CERO CONSULTA NUEVA Y CERO IMPUTACIÓN INVENTADA ═══
//
// Las cuatro sub-vistas leen lo que YA existe: `getPedidosMateriales`, `getHerramientas` y
// `getMovimientos` de Integraciones, y `costos_obra` —el espejo de la pestaña Compras del Sheet—
// que es de donde `obra_panel` saca el costo real por obra. No se abre una fuente nueva para
// ninguna de las cuatro.
//
// ═══ EL PUENTE, QUE ES EL PROBLEMA REAL DE ESTA PANTALLA ═══
//
// Ninguna de las cuatro tablas guarda `obra_id` canónico:
//
//   · `pedidos_materiales.obra_texto`        el nombre tal como lo escribe el campo
//   · `costos_obra.obra_texto`               el nombre tal como lo escribe el Sheet
//   · `herramientas.ubicacion_actual`        ALMACEN / TALLER / <obra>
//   · `movimientos_herramienta.destino`      la ubicación destino
//
// (`pedidos_materiales.obra_id` SÍ existe, pero apunta a `public.obras` LEGACY —las cuatro obras
// pausadas que hacían que la web dijera "0 obras activas". Usarlo devolvería el universo equivocado.)
//
// El único puente verificable es `obra_alias`, que es el mismo que usa `obra_costo_real`. Un texto
// que no matchea ningún alias NO se muestra bajo esta obra: aparece como faltante. La regla del
// match vive en `orquestador/lib/obra-operacion.mjs` y está cubierta por tests.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getHerramientas, type Herramienta } from '@/features/integraciones/services/herramientasService'
import { getMovimientos, type MovimientoConHerramienta } from '@/features/integraciones/services/movimientosService'
import { getPedidosMateriales, type PedidoMaterial } from '@/features/integraciones/services/pedidosMaterialesService'
import { aliasDeObra, detalleCubreElTotal, esDeObra } from '../../../../orquestador/lib/obra-operacion.mjs'
import type { ServiceResult } from '../types'

export const SUBS_OPERACION = ['pedidos', 'compras', 'herramientas', 'movimientos'] as const
export type SubOperacion = (typeof SUBS_OPERACION)[number]

/** Una compra imputada a la obra, tal como vive en `costos_obra`. */
export interface CompraObra {
  id: string
  fecha: string | null
  proveedor: string | null
  concepto: string | null
  comprobante: string | null
  /** `total` (no `importe`): es la columna que suma `obra_costo_real`. */
  total: number | null
}

export interface ComprasObra {
  filas: CompraObra[]
  /** El costo real y su cobertura, tal como los publica `obra_costo_real`. No se recalculan acá. */
  total: number | null
  nComprobantes: number | null
  /** false = el detalle listado no llega al total que declara la base. Se dice, no se disimula. */
  completo: boolean
}

export interface OperacionObra {
  /** Los nombres normalizados con los que el campo identifica esta obra. Vacío = no hay puente. */
  nombres: string[]
  pedidos: PedidoMaterial[]
  compras: ComprasObra
  herramientas: Herramienta[]
  movimientos: MovimientoConHerramienta[]
}

/**
 * Los nombres con los que se puede reconocer esta obra en las tablas que la guardan como texto.
 * Sale de `obra_alias`, el mismo diccionario que usa la vista del costo real.
 */
export async function getNombresDeObra(
  supabase: SupabaseClient,
  obraId: string,
): Promise<ServiceResult<string[]>> {
  const { data, error } = await supabase.from('obra_alias').select('alias, obra_id, clasificacion')
  if (error) return { data: null, error: error.message }
  return { data: aliasDeObra(data ?? [], obraId), error: null }
}

/** Los pedidos de material hechos a nombre de esta obra, del más reciente al más viejo. */
export async function getPedidosObra(
  supabase: SupabaseClient,
  nombres: string[],
): Promise<ServiceResult<PedidoMaterial[]>> {
  if (!nombres.length) return { data: [], error: null }
  const { data, error } = await getPedidosMateriales(supabase)
  if (error) return { data: null, error }
  return { data: (data ?? []).filter((p) => esDeObra(nombres, p.obra_texto)), error: null }
}

/**
 * Las compras imputadas a esta obra, con el total que declara `obra_costo_real`.
 *
 * EL TOTAL NO SE SUMA ACÁ. Sale de la vista, que es la fuente única del costo real por obra y la
 * que ya consume `obra_panel`: dos cálculos del mismo número es el defecto que obligó a crear esa
 * vista. Lo que sí se hace es CONTROLAR que el detalle llegue a ese total — un control contra un
 * número que la base calculó por su cuenta, no contra el que produce esta función.
 */
export async function getComprasObra(
  supabase: SupabaseClient,
  obraId: string,
  nombres: string[],
): Promise<ServiceResult<ComprasObra>> {
  const { data: costo, error: errCosto } = await supabase
    .from('obra_costo_real')
    .select('costo_real, n_comprobantes')
    .eq('obra_id', obraId)
    .maybeSingle()
  if (errCosto) return { data: null, error: errCosto.message }
  // La vista devuelve 0 por el `left join` aunque la obra no tenga ninguna compra: un 0 sin
  // comprobantes no es "gastó cero", es "todavía no hay nada imputado", y esa diferencia viaja.
  const nComprobantes = costo?.n_comprobantes == null ? null : Number(costo.n_comprobantes)
  const total = nComprobantes ? Number(costo?.costo_real ?? 0) : null

  if (!nombres.length) {
    return { data: { filas: [], total, nComprobantes, completo: detalleCubreElTotal([], total) }, error: null }
  }

  const { data, error } = await supabase
    .from('costos_obra')
    .select('id, fecha, proveedor, concepto, comprobante, total, obra_texto')
    .order('fecha', { ascending: false, nullsFirst: false })
  if (error) return { data: null, error: error.message }

  const filas: CompraObra[] = (data ?? [])
    .filter((c) => esDeObra(nombres, c.obra_texto as string | null))
    .map((c) => ({
      id: c.id as string,
      fecha: (c.fecha as string | null) ?? null,
      proveedor: (c.proveedor as string | null) ?? null,
      concepto: (c.concepto as string | null) ?? null,
      comprobante: (c.comprobante as string | null) ?? null,
      total: c.total == null ? null : Number(c.total),
    }))

  return { data: { filas, total, nComprobantes, completo: detalleCubreElTotal(filas, total) }, error: null }
}

/** Las herramientas que hoy están en esta obra (su ubicación actual la nombra). */
export async function getHerramientasObra(
  supabase: SupabaseClient,
  nombres: string[],
): Promise<ServiceResult<Herramienta[]>> {
  if (!nombres.length) return { data: [], error: null }
  const { data, error } = await getHerramientas(supabase)
  if (error) return { data: null, error }
  return { data: (data ?? []).filter((h) => esDeObra(nombres, h.ubicacion_actual)), error: null }
}

/**
 * Los movimientos de herramienta HACIA esta obra.
 *
 * El límite se sube a 2.000 a propósito: `getMovimientos` corta en 200 GLOBALES, y filtrar después
 * de un corte global esconde en silencio los movimientos viejos de una obra con poco tráfico.
 */
export async function getMovimientosObra(
  supabase: SupabaseClient,
  nombres: string[],
): Promise<ServiceResult<MovimientoConHerramienta[]>> {
  if (!nombres.length) return { data: [], error: null }
  const { data, error } = await getMovimientos(supabase, 2000)
  if (error) return { data: null, error }
  return { data: (data ?? []).filter((m) => esDeObra(nombres, m.destino)), error: null }
}

/**
 * TODO lo de la solapa Operación en una sola llamada. Las cuatro lecturas van en paralelo porque
 * ninguna depende de otra; lo único secuencial es el puente, que las cuatro necesitan.
 *
 * Si una sub-vista falla, falla la solapa entera y con el mensaje de la base: media pantalla con
 * tres listas llenas y una vacía se lee como "esta obra no tiene movimientos", que es mentira.
 */
export async function getOperacionObra(
  supabase: SupabaseClient,
  obraId: string,
): Promise<ServiceResult<OperacionObra>> {
  const puente = await getNombresDeObra(supabase, obraId)
  if (puente.error !== null) return { data: null, error: puente.error }
  const nombres = puente.data

  const [pedidos, compras, herramientas, movimientos] = await Promise.all([
    getPedidosObra(supabase, nombres),
    getComprasObra(supabase, obraId, nombres),
    getHerramientasObra(supabase, nombres),
    getMovimientosObra(supabase, nombres),
  ])
  const fallo = [pedidos, compras, herramientas, movimientos].find((r) => r.error)
  if (fallo?.error) return { data: null, error: fallo.error }

  return {
    data: {
      nombres,
      pedidos: pedidos.data ?? [],
      compras: compras.data ?? { filas: [], total: null, nComprobantes: null, completo: true },
      herramientas: herramientas.data ?? [],
      movimientos: movimientos.data ?? [],
    },
    error: null,
  }
}
