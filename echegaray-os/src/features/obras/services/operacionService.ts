// OPERACIÓN — qué se pidió, qué se compró y qué recursos se movieron. Para UNA obra o para todas.
//
// ═══ CERO CONSULTA NUEVA Y CERO IMPUTACIÓN INVENTADA ═══
//
// Las cuatro sub-vistas leen lo que YA existe: `getPedidosMateriales`, `getHerramientas` y
// `getMovimientos` de Integraciones, y `costos_obra` —el espejo de la pestaña Compras del Sheet—
// que es de donde `obra_panel` saca el costo real por obra. No se abre una fuente nueva para
// ninguna de las cuatro.
//
// ═══ UNA SOLA LECTURA PARA LAS DOS PANTALLAS (19/08/2026) ═══
//
// El dueño, textual: *"MISMA TABLA/FUENTE → vista global + filtro por obra"* · *"NO crear dos
// sistemas"*. Por eso `getOperacion(supabase)` y `getOperacion(supabase, obraId)` son la MISMA
// función: la global no es otra consulta, es ésta sin el último filtro. Lo que cambia entre las dos
// pantallas es qué columnas se dibujan, nunca de dónde sale la fila.
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
// pausadas que hacían que la web dijera "0 obras activas". Usarlo devolvería el universo
// equivocado, y por eso el id canónico viaja en un campo con otro nombre: `obra_canonica_id`.)
//
// El único puente verificable es `obra_alias`, el mismo que usa `obra_costo_real`. Se resuelve UNA
// vez —`indiceDeAlias`— y con ese índice se ETIQUETA cada fila. Filtrar por obra pasa a ser comparar
// la etiqueta, así que la lista global y la ficha no pueden discrepar: es la misma etiqueta.
// La regla vive en `orquestador/lib/obra-operacion.mjs` y está cubierta por tests.
//
// ═══ QUÉ FILAS VUELVEN NO LO DECIDE ESTA CAPA ═══
//
// Lo decide `ve_obra_texto()` en las policies de las cuatro tablas
// (`20260819T0200_rls_por_obra_en_operacion.sql`). Acá NO se repite el predicado de seguridad: una
// segunda copia en TypeScript se desincroniza de la de Postgres y encima no protege la llamada
// directa a PostgREST, que es por donde se filtraba de verdad.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getHerramientas, type Herramienta } from '@/features/integraciones/services/herramientasService'
import { getMovimientos, type MovimientoConHerramienta } from '@/features/integraciones/services/movimientosService'
import { getPedidosMateriales, type PedidoMaterial } from '@/features/integraciones/services/pedidosMaterialesService'
import {
  aliasDeObra, detalleCubreElTotal, indiceDeAlias, obraDeTexto,
} from '../../../../orquestador/lib/obra-operacion.mjs'
import type { ServiceResult } from '../types'

// IMPEDIMENTOS ES EL QUINTO (20/08). El dueño puso los cinco bloques en Operación: *"PEDIDOS,
// COMPRAS, HERRAMIENTAS, MOVIMIENTOS, IMPEDIMENTOS"*. Los cuatro primeros son LECTURA de fuentes que
// viven afuera (el Sheet, el índice de herramientas); el quinto es el único que se escribe desde
// acá, y por eso su lista no la arma `getOperacionObra` sino que ya venía cargada en la página —
// `obra_restriccion` es una tabla del OS y la ficha la lee para todas sus solapas.
export const SUBS_OPERACION = ['pedidos', 'compras', 'herramientas', 'movimientos', 'impedimentos'] as const
export type SubOperacion = (typeof SUBS_OPERACION)[number]

/** El diccionario `obra_alias` dado vuelta. Opaco a propósito: sólo lo entiende `obraDeTexto`. */
export type IndiceObras = Map<string, string | symbol>

/**
 * LA ETIQUETA CANÓNICA. `null` = el texto de la fila no resuelve a ninguna obra: es gasto de
 * estructura (Administración, Taller, F931) o una grafía que nadie declaró todavía. Se dice; no se
 * la cuelga de la primera obra de la lista.
 */
export interface Imputada {
  obra_canonica_id: string | null
}

export type PedidoOperacion = PedidoMaterial & Imputada
export type HerramientaOperacion = Herramienta & Imputada
export type MovimientoOperacion = MovimientoConHerramienta & Imputada

/** Una compra imputada a la obra, tal como vive en `costos_obra`. */
export interface CompraObra extends Imputada {
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
  /**
   * El costo real y su cobertura, tal como los publica `obra_costo_real`. No se recalculan acá.
   * NULOS EN LA VISTA GLOBAL, y no por olvido: el total de una obra se controla donde vive el
   * número —la ficha y el portafolio—, y sumar todas las obras acá sería inventar una cifra nueva
   * (además de una que incluiría, o no, el gasto de estructura según quién mire).
   */
  total: number | null
  nComprobantes: number | null
  /** false = el detalle listado no llega al total que declara la base. Se dice, no se disimula. */
  completo: boolean
}

export interface OperacionObra {
  /** Los nombres normalizados con los que el campo identifica esta obra. Vacío en la vista global. */
  nombres: string[]
  pedidos: PedidoOperacion[]
  compras: ComprasObra
  herramientas: HerramientaOperacion[]
  movimientos: MovimientoOperacion[]
}

type FilaAlias = { alias: string; obra_id: string | null; clasificacion: string }

/** El diccionario crudo. Se lee UNA vez por pantalla: es la tabla más chica y la más consultada. */
async function leerAlias(supabase: SupabaseClient): Promise<ServiceResult<FilaAlias[]>> {
  const { data, error } = await supabase.from('obra_alias').select('alias, obra_id, clasificacion')
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as FilaAlias[], error: null }
}

/**
 * ETIQUETAR Y —SI HAY OBRA— FILTRAR. Es el único lugar donde se decide de qué obra es una fila, y
 * lo usan las cuatro listas de Operación. Cambiar el criterio acá lo cambia en las cuatro a la vez,
 * que es exactamente lo contrario de tener dos sistemas.
 */
function imputar<T>(
  filas: T[],
  idx: IndiceObras,
  texto: (f: T) => string | null,
  obraId?: string,
): (T & Imputada)[] {
  const marcadas = filas.map((f) => ({ ...f, obra_canonica_id: obraDeTexto(idx, texto(f)) as string | null }))
  return obraId ? marcadas.filter((f) => f.obra_canonica_id === obraId) : marcadas
}

/** Los pedidos de material, del más reciente al más viejo. Sin `obraId`, los de todas las obras. */
export async function getPedidos(
  supabase: SupabaseClient,
  idx: IndiceObras,
  obraId?: string,
): Promise<ServiceResult<PedidoOperacion[]>> {
  const { data, error } = await getPedidosMateriales(supabase)
  if (error) return { data: null, error }
  return { data: imputar(data ?? [], idx, (p) => p.obra_texto, obraId), error: null }
}

/** Las herramientas por su ubicación actual. Sin `obraId`, las de todas las obras visibles. */
export async function getHerramientasObra(
  supabase: SupabaseClient,
  idx: IndiceObras,
  obraId?: string,
): Promise<ServiceResult<HerramientaOperacion[]>> {
  const { data, error } = await getHerramientas(supabase)
  if (error) return { data: null, error }
  return { data: imputar(data ?? [], idx, (h) => h.ubicacion_actual, obraId), error: null }
}

/**
 * Los movimientos de herramienta HACIA una obra.
 *
 * El límite se sube a 2.000 SIEMPRE —también en la vista global— porque `getMovimientos` corta en
 * 200 GLOBALES: si la ficha leyera 2.000 y la lista global 200, la misma obra tendría dos cuentas
 * de movimientos y la global sería la que esconde los viejos.
 */
export async function getMovimientosObra(
  supabase: SupabaseClient,
  idx: IndiceObras,
  obraId?: string,
): Promise<ServiceResult<MovimientoOperacion[]>> {
  const { data, error } = await getMovimientos(supabase, 2000)
  if (error) return { data: null, error }
  return { data: imputar(data ?? [], idx, (m) => m.destino, obraId), error: null }
}

/**
 * Las compras. Con `obraId`, además del detalle trae el total que declara `obra_costo_real`.
 *
 * EL TOTAL NO SE SUMA ACÁ. Sale de la vista, que es la fuente única del costo real por obra y la
 * que ya consume `obra_panel`: dos cálculos del mismo número es el defecto que obligó a crear esa
 * vista. Lo que sí se hace es CONTROLAR que el detalle llegue a ese total — un control contra un
 * número que la base calculó por su cuenta, no contra el que produce esta función.
 */
export async function getComprasObra(
  supabase: SupabaseClient,
  idx: IndiceObras,
  obraId?: string,
): Promise<ServiceResult<ComprasObra>> {
  const { data, error } = await supabase
    .from('costos_obra')
    .select('id, fecha, proveedor, concepto, comprobante, total, obra_texto')
    .order('fecha', { ascending: false, nullsFirst: false })
  if (error) return { data: null, error: error.message }

  const filas: CompraObra[] = imputar(data ?? [], idx, (c) => c.obra_texto as string | null, obraId)
    .map((c) => ({
      id: c.id as string,
      obra_canonica_id: c.obra_canonica_id,
      fecha: (c.fecha as string | null) ?? null,
      proveedor: (c.proveedor as string | null) ?? null,
      concepto: (c.concepto as string | null) ?? null,
      comprobante: (c.comprobante as string | null) ?? null,
      total: c.total == null ? null : Number(c.total),
    }))

  if (!obraId) return { data: { filas, total: null, nComprobantes: null, completo: true }, error: null }

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
  return { data: { filas, total, nComprobantes, completo: detalleCubreElTotal(filas, total) }, error: null }
}

/**
 * TODO lo de Operación en una sola llamada. Las cuatro lecturas van en paralelo porque ninguna
 * depende de otra; lo único secuencial es el puente, que las cuatro necesitan.
 *
 * `obraId` sigue siendo OPCIONAL aunque hoy todos los llamadores lo pasen: la vista global
 * `/obras/operacion` se retiró el 20/08 (Operación es un dominio DE la obra, no del área). El modo
 * "todas las obras" no se saca acá a propósito — angostar el parámetro obliga a tocar las cuatro
 * lecturas de más abajo, y este archivo es el que consume la solapa de la obra. Si nunca vuelve a
 * hacer falta, se retira junto con el próximo cambio de esa solapa.
 *
 * Si una sub-vista falla, falla la pantalla entera y con el mensaje de la base: media pantalla con
 * tres listas llenas y una vacía se lee como "esta obra no tiene movimientos", que es mentira.
 */
export async function getOperacion(
  supabase: SupabaseClient,
  obraId?: string,
): Promise<ServiceResult<OperacionObra>> {
  const puente = await leerAlias(supabase)
  if (puente.error !== null) return { data: null, error: puente.error }
  const idx = indiceDeAlias(puente.data) as IndiceObras
  const nombres: string[] = obraId ? (aliasDeObra(puente.data, obraId) as string[]) : []

  const [pedidos, compras, herramientas, movimientos] = await Promise.all([
    getPedidos(supabase, idx, obraId),
    getComprasObra(supabase, idx, obraId),
    getHerramientasObra(supabase, idx, obraId),
    getMovimientosObra(supabase, idx, obraId),
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

/** El nombre viejo, que usa la ficha de la obra. Es la misma función con la obra puesta. */
export const getOperacionObra = (supabase: SupabaseClient, obraId: string) => getOperacion(supabase, obraId)
