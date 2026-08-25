// LAS TRES LECTURAS DEL PULSO DEL PLANTEL — una consulta por columna, no una por persona.
//
// ═══ POR QUÉ AGRUPADAS Y NO POR FILA ═══
//
// La tentación es obvia: la tabla ya tiene la lista de personas, y cada fila necesita su marca, sus
// horas y sus papeles. Diecisiete personas × tres preguntas son 51 viajes a PostgREST en cada carga
// de la pantalla, cada uno con su chequeo de RLS. La pantalla de tareas ya pagó ese precio en este
// repo (cerrar un panel tardaba 12-26 s) y el arreglo fue el mismo: traer el conjunto entero de una
// y agrupar en memoria. Son tres lecturas, y van en la MISMA tanda que el directorio.
//
// ═══ CADA FUENTE FALLA POR SEPARADO, Y SE DICE POR SEPARADO ═══
//
// Ninguna de las tres puede tirar abajo el listado: el directorio se muestra igual. Pero una lectura
// que falló NO se pinta como «no hay nada» — la columna se apaga y la pantalla nombra el error. Una
// tabla que dice «sin fichar» en las diecisiete filas porque la RLS rechazó `presencia_del_dia` es
// indistinguible de un día en que nadie fichó, y la diferencia entre las dos es todo.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { FilaHHDelMes, MarcaDeHoy, PapelDeLegajo } from './pulsoDelPlantel'

/** Lo que una de las tres lecturas devuelve: las filas, o el motivo por el que no hay filas.
 *  `data` nunca es `null` con `error` nulo — quien lo consume no tiene que elegir un default. */
export interface Lectura<T> {
  data: T[]
  error: string | null
}

const vacia = <T>(error: string): Lectura<T> => ({ data: [], error })

/**
 * Las marcas de HOY de todo el plantel, en una consulta.
 *
 * `presencia_del_dia` corre con los permisos de quien pregunta (`security_invoker = true`): acá no
 * hay filtro por rol y no debe haberlo. Si mañana el jefe de obra ve sólo la suya, se cambia la
 * policy de `asistencia_marca` y esta lectura obedece sola.
 */
export async function getMarcasDeHoy(
  supabase: SupabaseClient, hoy: string,
): Promise<Lectura<MarcaDeHoy>> {
  const { data, error } = await supabase
    .from('presencia_del_dia').select('persona_id, estado').eq('fecha', hoy)
  if (error) {
    // El código de «la vista no existe» se dice con el nombre de la migración que falta: sin eso,
    // el mensaje de PostgREST manda a buscar un problema de permisos que no existe.
    const falta = error.code === '42P01' || error.code === 'PGRST205' || error.code === '42703'
    return vacia(falta
      ? 'Falta aplicar en la base la migración 20260820T7000_donde_empezo_la_jornada.'
      : error.message)
  }
  return { data: (data ?? []) as unknown as MarcaDeHoy[], error: null }
}

/**
 * Las imputaciones de horas del mes corriente, de todo el plantel, en una consulta.
 *
 * Se piden todas las filas de la ventana y se agrupa en memoria: `registros_hh` del mes son cientos
 * de filas, no miles, y un `group by` por PostgREST exigiría una vista nueva —una segunda definición
 * de «horas del mes» al lado de la que ya usa la ficha—.
 *
 * Las filas legacy sin `persona_id` vienen igual y `hhPorPersona` las descarta: no se sabe de quién
 * son, y repartirlas por parecido de nombre inventaría horas con dueño.
 */
export async function getHHDelMes(
  supabase: SupabaseClient, desde: string, hasta: string,
): Promise<Lectura<FilaHHDelMes>> {
  const { data, error } = await supabase
    .from('registros_hh').select('persona_id, fecha, horas, tipo_hora')
    .gte('fecha', desde).lte('fecha', hasta)
  if (error) return vacia(error.message)
  // `horas` es numeric: PostgREST lo manda como TEXTO. Sin este Number, la suma concatenaría.
  return {
    data: ((data ?? []) as unknown as FilaHHDelMes[]).map((f) => ({ ...f, horas: Number(f.horas) })),
    error: null,
  }
}

/**
 * Los papeles del legajo de todo el plantel, en una consulta.
 *
 * NO se piden `nombre` ni `drive_file_id`: la columna sólo cuenta vencimientos, y lo que la pantalla
 * no muestra tampoco viaja al navegador — es la misma regla que sostiene el listado.
 *
 * `fecha_vencimiento` la agregó la migración 20260820T3000. El grant de `documentacion_legajo` es
 * por TABLA, así que la columna nueva nació con permiso; si fuera por columna, se leería vacía sin
 * un solo error.
 */
export async function getPapelesDelPlantel(
  supabase: SupabaseClient,
): Promise<Lectura<PapelDeLegajo>> {
  const { data, error } = await supabase
    .from('documentacion_legajo').select('persona_id, presente, fecha_vencimiento')
  if (error) {
    const falta = error.code === '42703'
    return vacia(falta
      ? 'Falta aplicar en la base la migración 20260820T3000 (documentacion_legajo.fecha_vencimiento).'
      : error.message)
  }
  return { data: (data ?? []) as unknown as PapelDeLegajo[], error: null }
}
