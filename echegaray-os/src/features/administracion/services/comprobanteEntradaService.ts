// LO QUE LA PANTALLA 24 LE PREGUNTA A LA COLA DE COMPROBANTES SUBIDOS.
//
// Es UNA lectura de `public.comprobante_entrada` — la misma fila que escribe el worker de la VM
// cuando termina de procesar. No hay una segunda fuente del estado de una carga: la app no sabe si
// un comprobante entró, lo lee de donde el worker lo dejó.
//
// LA LISTA ES CORTA A PROPÓSITO. No es un historial: es «qué pasó con lo que acabo de subir». El
// historial del gasto es la pestaña Compras y el libro de ARCA, que es la tabla grande de esta misma
// pantalla. Traer trescientas cargas viejas acá sería un segundo listado compitiendo con el primero.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EntradaComprobante } from './comprobanteEntrada'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

/** Cuántas cargas recientes se muestran. Es `MAX_ARCHIVOS` de un lote más margen para el anterior. */
export const TOPE_ENTRADAS = 16

const COLUMNAS = 'id, nombre_archivo, media_type, bytes, estado, motivo, subido_at, subido_por, resultado'

/**
 * Las cargas recientes, más nuevas primero.
 *
 * NO FILTRA POR USUARIO. La RLS ya decide quién ve la tabla (`es_administracion()`), y dentro de
 * Administración lo que subió otro es información útil: dos personas cargando el mismo fajo de
 * papeles tienen que verse una a la otra o lo cargan dos veces.
 *
 * Si la tabla todavía no existe —la migración se aplica aparte— NO se rompe la pantalla: se devuelve
 * la lista vacía con el motivo. Una pantalla que revienta entera porque falta una tabla nueva es
 * peor que una pantalla sin la sección nueva.
 */
// ═══ LA LISTA NO SE ACUMULA (dueño 25/09) ═══
//
// «Se empiezan a acumular esos comprobantes arriba, no quiero eso, rompe todo y no se quitan».
// La pregunta que contesta la lista es «¿entró lo que acabo de subir?»: una carga que ya terminó
// hace más de unos minutos ya tiene su respuesta en la tabla de abajo (o en Efectivo, si fue una
// rendición). Se muestra lo que sigue en curso y lo que terminó o se subió hace menos de
// RECIENTE_MIN. «En espera» (una rendición que espera la confirmación de quien rinde) se resuelve en
// Efectivo: acá sólo aparece mientras es reciente.
export const RECIENTE_MIN = 10

export async function getEntradas(
  supabase: SupabaseClient,
  { limite = TOPE_ENTRADAS, ahora = new Date() }: { limite?: number; ahora?: Date } = {},
): Promise<ServiceResult<EntradaComprobante[]>> {
  const desde = new Date(ahora.getTime() - RECIENTE_MIN * 60_000).toISOString()
  const { data, error } = await supabase
    .from('comprobante_entrada')
    .select(COLUMNAS)
    .or(`and(cerrado_at.is.null,estado.neq.en_espera),subido_at.gte.${desde},cerrado_at.gte.${desde}`)
    .order('subido_at', { ascending: false })
    .limit(limite)

  if (error) {
    const falta = /relation .* does not exist|schema cache|permission denied/i.test(error.message)
    return falta
      ? { data: [], error: null }
      : { data: null, error: error.message }
  }
  return { data: (data ?? []) as unknown as EntradaComprobante[], error: null }
}
