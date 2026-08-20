// OPERACIÓN GLOBAL — las mismas listas que dentro de una obra, sin acotar por obra.
//
// ═══ CADA FILA DICE A QUÉ OBRA PERTENECE, Y CUANDO NO SE SABE LO DICE ═══
//
// Ninguna de las tres tablas guarda el id canónico de la obra: `pedidos_materiales.obra_texto`,
// `herramientas.ubicacion_actual` y `movimientos_herramienta.destino` traen el nombre TAL COMO lo
// escribe el campo. El puente es `obra_alias`, el mismo diccionario que usa `obra_costo_real`, y la
// regla que lo aplica vive en `orquestador/lib/obra-operacion.mjs` — una sola implementación para
// la ficha de la obra, la lista global y el orquestador.
//
// Un texto que no resuelve a ninguna obra NO se cuelga de la primera de la lista: se muestra «sin
// obra». Eso es Administración, Taller o una grafía que nadie declaró todavía, y confundirlo con
// una obra imputaría el gasto de la empresa a un cliente.
//
// ═══ QUÉ FILAS VUELVEN NO LO DECIDE ESTA CAPA ═══
//
// Lo decide `ve_obra_texto()` en las policies de las tres tablas. Acá no se repite el predicado de
// seguridad: una segunda copia en TypeScript se desincroniza de la de Postgres y encima no protege
// la llamada directa a PostgREST.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getHerramientas, type Herramienta } from './herramientasService'
import { getMovimientos, type MovimientoConHerramienta } from './movimientosService'
import { getPedidosMateriales, type PedidoMaterial } from './pedidosMaterialesService'
import { indiceDeAlias, obraDeTexto } from '../../../../orquestador/lib/obra-operacion.mjs'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

/** El diccionario dado vuelta. Opaco a propósito: sólo lo entiende `obraDeTexto`. */
export type IndiceObras = Map<string, string | symbol>

export interface PuenteObras {
  indice: IndiceObras
  /** id canónico → nombre lindo. Es lo que se dibuja en la columna Obra. */
  nombres: Map<string, string>
}

export interface ConObra {
  obra_canonica_id: string | null
  obra_nombre: string | null
}

export type PedidoGlobal = PedidoMaterial & ConObra
export type HerramientaGlobal = Herramienta & ConObra
export type MovimientoGlobal = MovimientoConHerramienta & ConObra

/** Una actividad ofrecible en el selector «Para la actividad». */
export interface ActividadOpcion {
  id: string
  obra_id: string
  nombre: string
  codigo: string | null
}

/**
 * ETIQUETAR. Función pura y exportada porque es la regla que hace que la lista global y la ficha de
 * la obra no puedan discrepar: las dos comparan la MISMA etiqueta.
 */
export function etiquetar<T>(filas: T[], puente: PuenteObras, texto: (f: T) => string | null): (T & ConObra)[] {
  return filas.map((f) => {
    const id = obraDeTexto(puente.indice, texto(f)) as string | null
    return { ...f, obra_canonica_id: id, obra_nombre: id ? (puente.nombres.get(id) ?? null) : null }
  })
}

/** El puente se lee UNA vez por pantalla: son las dos tablas más chicas y las más consultadas. */
export async function getPuenteObras(supabase: SupabaseClient): Promise<ServiceResult<PuenteObras>> {
  const [alias, canonicas] = await Promise.all([
    supabase.from('obra_alias').select('alias, obra_id, clasificacion'),
    supabase.from('obra_canonica').select('id, nombre'),
  ])
  if (alias.error) return { data: null, error: alias.error.message }
  if (canonicas.error) return { data: null, error: canonicas.error.message }
  const nombres = new Map<string, string>()
  for (const o of canonicas.data ?? []) nombres.set(o.id as string, o.nombre as string)
  return { data: { indice: indiceDeAlias(alias.data ?? []) as IndiceObras, nombres }, error: null }
}

export async function getPedidosGlobal(
  supabase: SupabaseClient,
  puente: PuenteObras,
): Promise<ServiceResult<PedidoGlobal[]>> {
  const { data, error } = await getPedidosMateriales(supabase)
  if (error !== null) return { data: null, error }
  return { data: etiquetar(data ?? [], puente, (p) => p.obra_texto), error: null }
}

export async function getHerramientasGlobal(
  supabase: SupabaseClient,
  puente: PuenteObras,
): Promise<ServiceResult<HerramientaGlobal[]>> {
  const { data, error } = await getHerramientas(supabase)
  if (error !== null) return { data: null, error }
  return { data: etiquetar(data ?? [], puente, (h) => h.ubicacion_actual), error: null }
}

/**
 * El límite es el MISMO que usa la solapa de la obra (2.000). Si la global leyera menos, la misma
 * obra tendría dos cuentas de movimientos y la global sería la que esconde los viejos.
 */
export async function getMovimientosGlobal(
  supabase: SupabaseClient,
  puente: PuenteObras,
  limit = 2000,
): Promise<ServiceResult<MovimientoGlobal[]>> {
  const { data, error } = await getMovimientos(supabase, limit)
  if (error !== null) return { data: null, error }
  return { data: etiquetar(data ?? [], puente, (m) => m.destino), error: null }
}

/**
 * LAS ACTIVIDADES ELEGIBLES DE CADA OBRA, para el selector «Para la actividad».
 *
 * En la lista global las filas son de varias obras a la vez, así que el selector de una fila sólo
 * puede ofrecer las actividades DE SU OBRA: por eso vuelven agrupadas por obra y no en una lista
 * sola. Se piden únicamente las obras que aparecen en la lista — no las 20 de la cartera.
 *
 * Quedan afuera las de resumen (son títulos, no trabajo), las archivadas y las tareas (que cuelgan
 * de otra actividad). Es el mismo recorte que hace la solapa Operación de la obra.
 */
export async function getActividadesDeObras(
  supabase: SupabaseClient,
  obraIds: string[],
): Promise<ServiceResult<Record<string, ActividadOpcion[]>>> {
  if (obraIds.length === 0) return { data: {}, error: null }
  const { data, error } = await supabase
    .from('obra_actividad')
    .select('id, obra_id, nombre, codigo, tipo, archivada, actividad_padre_id')
    .in('obra_id', obraIds)
    .eq('archivada', false)
    .is('actividad_padre_id', null)
    .neq('tipo', 'resumen')
    .order('orden', { ascending: true })
  if (error) return { data: null, error: error.message }
  const porObra: Record<string, ActividadOpcion[]> = {}
  for (const a of data ?? []) {
    const fila: ActividadOpcion = {
      id: a.id as string,
      obra_id: a.obra_id as string,
      nombre: (a.nombre as string) ?? '',
      codigo: (a.codigo as string | null) ?? null,
    }
    ;(porObra[fila.obra_id] ??= []).push(fila)
  }
  return { data: porObra, error: null }
}
