// CUADRILLAS — la lectura.
//
// La cuadrilla NO guarda a qué obra va: eso se deriva de las asignaciones vigentes de sus
// integrantes. La vista `cuadrilla_panel` hace esa derivación y es la única que la hace.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Cuadrilla, Integrante, ServiceResult } from '../types'
// RUTA RELATIVA CON EXTENSIÓN: `node --test` no conoce el alias `@/`, y un import de VALOR por alias
// mata la prueba con ERR_MODULE_NOT_FOUND antes de la primera aserción.
import { esTrabajada } from '../../obras/services/tipoHora.ts'
import { contieneEnAlguno } from '../../../shared/utils/busqueda.ts'

/**
 * FILTRAR POR TEXTO — en memoria, sobre lo que la consulta ya trajo.
 *
 * `cuadrilla_panel` son unas pocas filas y ya viajan enteras: pedirle a Postgres un `ilike` por cada
 * tecla sería un viaje para descartar tres filas. Lo que sí queda en la URL es el texto, para que la
 * vista filtrada se pueda compartir y recargar.
 *
 * Se busca por NOMBRE, RESPONSABLE Y OBRA porque son las tres columnas que la tabla muestra. Buscar
 * sólo por el nombre haría que escribir el apellido del capataz —que está a la vista— vaciara la
 * lista, y quien busca concluiría que la cuadrilla no existe.
 */
export function filtrarCuadrillas<T extends Pick<Cuadrilla, 'nombre' | 'responsable' | 'obras_actuales'>>(
  cuadrillas: T[],
  q: string,
): T[] {
  return cuadrillas.filter((c) => contieneEnAlguno([c.nombre, c.responsable, c.obras_actuales], q))
}

export async function getCuadrillas(
  supabase: SupabaseClient,
  incluirInactivas = false,
): Promise<ServiceResult<Cuadrilla[]>> {
  let consulta = supabase.from('cuadrilla_panel').select('*')
  if (!incluirInactivas) consulta = consulta.eq('activa', true)
  const { data, error } = await consulta.order('nombre', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as Cuadrilla[], error: null }
}

/**
 * Los integrantes de una cuadrilla. Por defecto los VIGENTES; con `historial` también los que ya
 * salieron, que es lo que responde "¿quién estaba en esta cuadrilla en marzo?".
 *
 * El nombre se resuelve contra `persona_plantel` en una segunda consulta y no con un embed: el
 * plantel es una VISTA, y PostgREST sólo sabe embeber por una clave foránea declarada. Un embed
 * contra la vista compilaría y devolvería `null` para todo el mundo — el modo de falla más caro,
 * porque un nombre vacío parece un dato.
 */
export async function getIntegrantes(
  supabase: SupabaseClient,
  cuadrillaId: string,
  historial = false,
): Promise<ServiceResult<Integrante[]>> {
  let consulta = supabase
    .from('cuadrilla_integrante').select('id, persona_id, desde, hasta').eq('cuadrilla_id', cuadrillaId)
  if (!historial) consulta = consulta.is('hasta', null)
  const { data, error } = await consulta.order('desde', { ascending: false })
  if (error) return { data: null, error: error.message }

  const filas = (data ?? []) as { id: string; persona_id: string; desde: string; hasta: string | null }[]
  const ids = [...new Set(filas.map((f) => f.persona_id))]
  const nombres = new Map<string, string>()
  if (ids.length > 0) {
    const { data: personas } = await supabase.from('persona_plantel').select('id, nombre_completo').in('id', ids)
    for (const p of (personas ?? []) as { id: string; nombre_completo: string }[]) {
      nombres.set(p.id, p.nombre_completo)
    }
  }
  return {
    data: filas.map((f) => ({ ...f, nombre_completo: nombres.get(f.persona_id) ?? null })),
    error: null,
  }
}

/** La cuadrilla vigente de cada persona, para el selector de la ficha. */
export async function getCuadrillaDe(
  supabase: SupabaseClient,
  personaId: string,
): Promise<{ cuadrilla_id: string; desde: string } | null> {
  const { data } = await supabase
    .from('cuadrilla_integrante').select('cuadrilla_id, desde')
    .eq('persona_id', personaId).is('hasta', null).maybeSingle()
  return (data as { cuadrilla_id: string; desde: string } | null) ?? null
}

// ═══ LAS HH DE LA CUADRILLA — SUMADAS, NO GUARDADAS ═══
//
// El handoff pide «HH del período» en el panel de la cuadrilla. NO hay —ni va a haber— una columna
// con ese total: la cuadrilla es un conjunto de PERÍODOS de pertenencia, así que su total depende de
// quién la integraba en cada día del período. Un número guardado al lado quedaría viejo el primer
// día que entre o salga alguien, y nadie se enteraría.
//
// Se suma sobre `registros_hh`, que es la misma fuente que lee la ficha de cada persona y la solapa
// Personal de la obra. Una sola definición de «HH», leída por tres pantallas.

/** Sólo las horas TRABAJADAS y sólo dentro de la ventana. Una ausencia tiene horas y no es trabajo:
 *  sumarla diría que la cuadrilla trabajó el día que faltó medio equipo. */
export function sumarHHTrabajadas(
  filas: { fecha: string | null; horas: number | string | null; tipo_hora: string }[],
  desde: string,
  hasta: string,
): number {
  return filas
    .filter((f) => f.fecha != null && f.fecha >= desde && f.fecha <= hasta && esTrabajada(f.tipo_hora))
    .reduce((a, f) => a + Number(f.horas ?? 0), 0)
}

/**
 * Las HH del período de las personas indicadas.
 *
 * `null` —y no 0— cuando no hay a quién sumarle o cuando la lectura falló: «0,00 HH» afirma que la
 * cuadrilla no trabajó, y eso no es lo mismo que no saberlo.
 */
export async function getHHDeCuadrilla(
  supabase: SupabaseClient,
  personaIds: string[],
  desde: string,
  hasta: string,
): Promise<number | null> {
  if (personaIds.length === 0) return null
  const { data, error } = await supabase
    .from('registros_hh').select('fecha, horas, tipo_hora')
    .in('persona_id', personaIds).gte('fecha', desde).lte('fecha', hasta)
  if (error) return null
  return sumarHHTrabajadas(
    (data ?? []) as { fecha: string | null; horas: number | string | null; tipo_hora: string }[],
    desde, hasta,
  )
}
