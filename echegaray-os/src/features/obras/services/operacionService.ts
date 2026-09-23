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
// TRES de las cuatro tablas no guardan `obra_id` canónico:
//
//   · `pedidos_materiales.obra_texto`        el nombre tal como lo escribe el campo
//   · `herramientas.ubicacion_actual`        ALMACEN / TALLER / <obra>
//   · `movimientos_herramienta.destino`      la ubicación destino
//
// La cuarta SÍ: `costos_obra.obra_id` es la columna «Obra» que cada fila de Compras trae desde el
// 14/09/2026, y desde el 15/09 las compras se filtran por ahí y no por el puente. El texto que se
// usaba (`obra_texto`) es la columna J del Sheet, que dice el CLIENTE: la ficha de cualquier obra de
// La Estrella se traía las compras de las cinco.
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
import type { PedidoMaterial } from '@/features/integraciones/services/pedidosMaterialesService'
import { getEquiposDeObra, type EquiposDeObra } from './equiposDeObraService'
import {
  aliasDeObra, detalleCubreElTotal, indiceDeAlias, obraDeTexto,
} from '../../../../orquestador/lib/obra-operacion.mjs'
import type { ServiceResult } from '../types'

// IMPEDIMENTOS ES EL QUINTO (20/08). El dueño puso los cinco bloques en Operación: *"PEDIDOS,
// COMPRAS, HERRAMIENTAS, MOVIMIENTOS, IMPEDIMENTOS"*. Los cuatro primeros son LECTURA de fuentes que
// viven afuera (el Sheet, el índice de herramientas); el quinto es el único que se escribe desde
// acá, y por eso su lista no la arma `getOperacionObra` sino que ya venía cargada en la página —
// `obra_restriccion` es una tabla del OS y la ficha la lee para todas sus solapas.
//
// ═══ LA TAXONOMÍA LA FIJA EL DESIGN CANÓNICO (23/08 · pantalla 11) ═══
//
// Impedimentos · Pedidos · Equipos · Clima. El orden no es decorativo: primero lo que FRENA la
// obra, después lo que la abastece. La lista de cinco anterior ordenaba por origen del dato (lo que
// viene del Sheet primero) en vez de por urgencia de quien mira.
//
// EQUIPOS FUSIONA «Herramientas» y «Movimientos»: son el mismo recurso —qué hay en obra y cómo
// llegó—, y separarlos obligaba a cambiar de pestaña para contestar una sola pregunta. Las dos
// tablas siguen enteras adentro; no se perdió ninguna columna.
//
// CLIMA sale de `obra_restriccion` con `tipo = 'clima'` (migración 20260823T1000). No es una fuente
// nueva: es el mismo impedimento visto por su motivo.
//
// COMPRAS SE QUEDA AL FINAL Y ES UNA DESVIACIÓN DECLARADA del canónico, que no la dibuja. Es
// capacidad real y única —el detalle del costo imputado a la obra contra el total que declara
// `obra_costo_real`— y no vive en ninguna otra pantalla de la ficha. Sacarla para parecerse al
// dibujo habría borrado una capacidad; queda última porque es la que menos se abre en el día.
// Los subs de Operación y la traducción de la URL viven en `subsOperacion.ts` (puro, sin alias
// `@/`, para que `node --test` los pueda mirar). Se reexportan para no mover a nadie.
export { SUBS_OPERACION, subDeLaUrl, type SubOperacion } from './subsOperacion.ts'

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

/** Un pedido con las columnas que la app agregó (20260923T1900) y quién lo pidió, ya por nombre. */
export type PedidoOperacion = PedidoMaterial & Imputada & {
  unidad: string | null
  nota: string | null
  /** Quién lo pidió (`creado_por` → `perfiles.nombre`). `null` = no consta: el Sheet no lo trae. */
  quien: string | null
}

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
  /** `obra_costo_real.costo_mano_de_obra`. `null` sin obra. */
  manoDeObra: number | null
  /** Suma de `costos_obra.total` con `obra_id` nulo en toda la empresa (12: «Sin imputar»). `null` = no se leyó. */
  sinImputarEmpresa: number | null
  /** Suma de `obra_costo_real.costo_real` de todas las obras (12: «contra $ X imputados a obras»). */
  imputadoEmpresa: number | null
}

export interface OperacionObra {
  /** Los nombres normalizados con los que el campo identifica esta obra. Vacío en la vista global. */
  nombres: string[]
  pedidos: PedidoOperacion[]
  compras: ComprasObra
  /** Del modelo nuevo de Herramientas (11 · M14). `null` en la vista global. */
  equipos: EquiposDeObra | null
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

/**
 * Los pedidos de material, del más reciente al más viejo. Sin `obraId`, los de todas las obras.
 *
 * DOS PUERTAS A LA MISMA OBRA (20260923T1900): la app escribe `obra_canonica_id` y ésa es la verdad;
 * el Sheet sólo trae `obra_texto` y se resuelve por el diccionario. Quién lo pidió sale de
 * `creado_por` → `perfiles.nombre`; el Sheet no lo trae y queda `null` (la pantalla dice «sin registrar»).
 */
export async function getPedidos(
  supabase: SupabaseClient,
  idx: IndiceObras,
  obraId?: string,
): Promise<ServiceResult<PedidoOperacion[]>> {
  const { data, error } = await supabase
    .from('pedidos_materiales')
    .select('id_pedido, obra_texto, obra_id, obra_canonica_id, fecha, material, cantidad, unidad, nota, estado, sincronizado_en, actividad_id, origen, creado_por')
    .order('fecha', { ascending: false, nullsFirst: false })
  if (error) return { data: null, error: error.message }
  type Fila = PedidoMaterial & { obra_canonica_id: string | null; unidad: string | null; nota: string | null; creado_por: string | null }
  const filas = (data ?? []) as Fila[]
  const marcadas = filas.map((f) => ({
    ...f,
    cantidad: f.cantidad == null ? null : Number(f.cantidad),
    obra_canonica_id: f.obra_canonica_id ?? (obraDeTexto(idx, f.obra_texto) as string | null),
  }))
  const propias = obraId ? marcadas.filter((f) => f.obra_canonica_id === obraId) : marcadas
  const usuarios = [...new Set(propias.map((f) => f.creado_por).filter((u): u is string => Boolean(u)))]
  // `perfiles` puede estar recortada por RLS: lo que no vuelve queda sin nombre, no inventado.
  const perfiles = usuarios.length ? await supabase.from('perfiles').select('id, nombre').in('id', usuarios) : null
  const nombre = new Map(((perfiles?.data ?? []) as { id: string; nombre: string | null }[]).map((p) => [p.id, p.nombre]))
  return {
    data: propias.map(({ creado_por, ...f }) => ({ ...f, quien: (creado_por && nombre.get(creado_por)) || null })),
    error: null,
  }
}

/**
 * Las compras. Con `obraId`, además del detalle trae el total que declara `obra_costo_real`.
 *
 * ═══ LA ÚNICA LISTA QUE NO PASA POR `obra_alias` (15/09/2026) ═══
 *
 * Las otras tres listas de Operación resuelven un texto libre porque no tienen otra cosa
 * (`ubicacion_actual`, `destino`, `obra_texto` del pedido). Las compras SÍ la tienen desde que cada
 * fila del Sheet trae su columna «Obra»: `costos_obra.obra_id`. Seguir resolviendo el texto acá era
 * leer la columna J —que dice el CLIENTE— y traerse las compras de las cinco obras de La Estrella a
 * cualquiera de ellas, que es el mismo defecto que tenía `obra_costo_real`. El filtro se hace en la
 * base, así que la ficha no trae 900 filas para descartar 870.
 *
 * EL TOTAL NO SE SUMA ACÁ. Sale de la vista, que es la fuente única del costo real por obra y la
 * que ya consume `obra_panel`: dos cálculos del mismo número es el defecto que obligó a crear esa
 * vista. Lo que sí se hace es CONTROLAR que el detalle llegue a ese total — un control contra un
 * número que la base calculó por su cuenta, no contra el que produce esta función.
 */
export async function getComprasObra(
  supabase: SupabaseClient,
  obraId?: string,
): Promise<ServiceResult<ComprasObra>> {
  const consulta = supabase
    .from('costos_obra')
    .select('id, fecha, proveedor, concepto, comprobante, total, obra_id')
    .order('fecha', { ascending: false, nullsFirst: false })
  const { data, error } = await (obraId ? consulta.eq('obra_id', obraId) : consulta)
  if (error) return { data: null, error: error.message }

  const filas: CompraObra[] = (data ?? []).map((c) => ({
    id: c.id as string,
    // `obra_id` null = la fila no está imputada a ninguna obra. No se la cuelga de ninguna.
    obra_canonica_id: (c.obra_id as string | null) ?? null,
    fecha: (c.fecha as string | null) ?? null,
    proveedor: (c.proveedor as string | null) ?? null,
    concepto: (c.concepto as string | null) ?? null,
    comprobante: (c.comprobante as string | null) ?? null,
    total: c.total == null ? null : Number(c.total),
  }))

  if (!obraId) {
    return {
      data: { filas, total: null, nComprobantes: null, completo: true, manoDeObra: null, sinImputarEmpresa: null, imputadoEmpresa: null },
      error: null,
    }
  }

  // LAS CIFRAS DEL 12 salen de la MISMA vista que el costo de la obra. «Sin imputar en toda la
  // empresa» es la única que se suma acá, y es porque no hay vista que la publique: son las filas de
  // Compras sin columna «Obra». Si la lectura falla queda `null`, nunca 0.
  const [costo, todas, sinObra] = await Promise.all([
    supabase.from('obra_costo_real').select('costo_real, n_comprobantes, costo_mano_de_obra').eq('obra_id', obraId).maybeSingle(),
    supabase.from('obra_costo_real').select('costo_real').limit(1000),
    supabase.from('costos_obra').select('total').is('obra_id', null).limit(5000),
  ])
  if (costo.error) return { data: null, error: costo.error.message }
  // La vista devuelve 0 por el `left join` aunque la obra no tenga ninguna compra: un 0 sin
  // comprobantes no es "gastó cero", es "todavía no hay nada imputado", y esa diferencia viaja.
  const nComprobantes = costo.data?.n_comprobantes == null ? null : Number(costo.data.n_comprobantes)
  const total = nComprobantes ? Number(costo.data?.costo_real ?? 0) : null
  const manoDeObra = nComprobantes ? Number(costo.data?.costo_mano_de_obra ?? 0) : null
  const suma = (xs: unknown[] | null | undefined, k: string) =>
    xs == null ? null : xs.reduce<number>((acc, f) => acc + Number((f as Record<string, unknown>)[k] ?? 0), 0)
  return {
    data: {
      filas, total, nComprobantes, completo: detalleCubreElTotal(filas, total), manoDeObra,
      imputadoEmpresa: todas.error ? null : suma(todas.data, 'costo_real'),
      sinImputarEmpresa: sinObra.error ? null : suma(sinObra.data, 'total'),
    },
    error: null,
  }
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

  const [pedidos, compras, equipos] = await Promise.all([
    getPedidos(supabase, idx, obraId),
    getComprasObra(supabase, obraId),
    obraId ? getEquiposDeObra(supabase, obraId) : null,
  ])
  const fallo = [pedidos, compras, equipos].find((r) => r?.error)
  if (fallo?.error) return { data: null, error: fallo.error }

  return {
    data: {
      nombres,
      pedidos: pedidos.data ?? [],
      compras: compras.data ?? {
        filas: [], total: null, nComprobantes: null, completo: true, manoDeObra: null, sinImputarEmpresa: null, imputadoEmpresa: null,
      },
      equipos: equipos?.data ?? null,
    },
    error: null,
  }
}

/** El nombre viejo, que usa la ficha de la obra. Es la misma función con la obra puesta. */
export const getOperacionObra = (supabase: SupabaseClient, obraId: string) => getOperacion(supabase, obraId)
